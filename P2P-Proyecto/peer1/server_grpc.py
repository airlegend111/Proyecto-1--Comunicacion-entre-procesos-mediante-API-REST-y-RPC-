import grpc, os, json, time, sys, requests
from concurrent import futures

# Agregar el directorio padre al path para poder importar desde el directorio raíz
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

import files_pb2
import files_pb2_grpc

class FileService(files_pb2_grpc.FileServiceServicer):
    def __init__(self, shared_dir, config):
        self.shared_dir = shared_dir
        self.config = config
        
    def _update_maestro_registry(self):
        """Notifica al maestro sobre cambios en los archivos"""
        try:
            files = os.listdir(self.shared_dir)
            peer_url = f"http://localhost:{self.config['port']}"
            data = {"peer": peer_url, "files": files, "grpc_port": self.config["grpc_port"]}
            
            maestro_url = self.config["maestro_url"]
            requests.post(f"{maestro_url}/register", json=data, timeout=5)
            print(f"✅ Registro actualizado en Maestro: {files}")
        except Exception as e:
            print(f"❌ Error actualizando registro en Maestro: {e}")

    def Upload(self, request, context):
        try:
            path = os.path.join(self.shared_dir, request.filename)
            with open(path, "wb") as f:
                f.write(request.content)
            
            # Actualizar registro en Maestro después de upload exitoso
            self._update_maestro_registry()
            
            return files_pb2.UploadResponse(ok=True, message=f"Saved {request.filename}")
        except Exception as e:
            return files_pb2.UploadResponse(ok=False, message=str(e))

    def Download(self, request, context):
        path = os.path.join(self.shared_dir, request.filename)
        if not os.path.isfile(path):
            return files_pb2.DownloadResponse(ok=False, content=b"", message="Not found")
        with open(path, "rb") as f:
            data = f.read()
        return files_pb2.DownloadResponse(ok=True, content=data, message="OK")

def serve(config_path):
    with open(config_path) as f:
        cfg = json.load(f)
    grpc_port = cfg["grpc_port"]
    shared_dir = cfg["shared_dir"]

    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    files_pb2_grpc.add_FileServiceServicer_to_server(FileService(shared_dir, cfg), server)
    server.add_insecure_port(f"[::]:{grpc_port}")
    server.start()
    print(f"gRPC server listening on {grpc_port}")
    try:
        while True:
            time.sleep(86400)
    except KeyboardInterrupt:
        server.stop(0)
