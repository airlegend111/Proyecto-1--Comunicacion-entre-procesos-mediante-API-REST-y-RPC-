from fastapi import FastAPI, Request
from pydantic import BaseModel
import json

# Cargar configuración
import os
config_path = os.path.join(os.path.dirname(__file__), "config.json")
with open(config_path) as f:
    config = json.load(f)

app = FastAPI(title="Peer Maestro")

# Diccionario donde se almacenarán los registros de los peers
# Estructura: { "archivo.txt": [{"rest": "http://ip:puerto", "grpc_port": 9002}, ...] }
directorio = {}

# Registro de peers activos con su información completa
peers_registry = {}

# Modelo para el registro
class RegisterRequest(BaseModel):
    peer: str
    files: list[str]
    grpc_port: int

@app.get("/")
async def root():
    """
    Endpoint raíz del Maestro.
    """
    return {"message": "Servidor Maestro P2P", "status": "activo", "peers_registrados": len(peers_registry)}

@app.post("/register")
async def register(data: RegisterRequest):
    """
    Un peer se registra enviando su lista de archivos y su URL base.
    Ejemplo JSON:
    {
        "peer": "http://localhost:9001",
        "files": ["archivo1.txt", "archivo2.txt"],
        "grpc_port": 9002
    }
    """
    peer_url = data.peer
    files = data.files
    grpc_port = data.grpc_port

    # Registrar el peer en el registro general
    peers_registry[peer_url] = {
        "rest": peer_url,
        "grpc_port": grpc_port,
        "files": files
    }

    # Actualizar el directorio de archivos
    for f in files:
        if f not in directorio:
            directorio[f] = []
        
        # Buscar si ya existe este peer para el archivo
        peer_info = {"rest": peer_url, "grpc_port": grpc_port}
        peer_exists = False
        for existing_peer in directorio[f]:
            if existing_peer["rest"] == peer_url:
                existing_peer["grpc_port"] = grpc_port
                peer_exists = True
                break
        
        if not peer_exists:
            directorio[f].append(peer_info)

    return {"status": "registered", "peer": peer_url, "files": files, "grpc_port": grpc_port}

@app.get("/locate")
async def locate(file: str):
    """
    Buscar qué peers tienen un archivo.
    Ejemplo: /locate?file=archivo1.txt
    """
    peers = directorio.get(file, [])
    return {"file": file, "peers": peers}

@app.get("/peers")
async def list_peers():
    """
    Listar todos los peers registrados.
    """
    return {"peers": list(peers_registry.values())}

@app.get("/directory")
async def show_directory():
    """
    Mostrar el directorio completo de archivos.
    """
    return {"directory": directorio}
