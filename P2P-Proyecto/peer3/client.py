import requests
import sys
import os
from urllib.parse import urlparse

# Agregar el directorio padre al path para poder importar desde common
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from common.grpc_client import download_from_peer, upload_to_peer

def locate(maestro_url, filename):
    """Localizar un archivo usando el servidor Maestro"""
    r = requests.get(f"{maestro_url}/locate", params={"file": filename}, timeout=5)
    return r.json().get("peers", [])

def locate_via_peer(peer_url, filename):
    """Localizar un archivo usando otro peer directamente"""
    try:
        r = requests.get(f"{peer_url}/locate", params={"file": filename}, timeout=5)
        return r.json().get("peers", [])
    except Exception as e:
        print(f"Error localizando vía peer {peer_url}: {e}")
        return []

def request_download(maestro_url, filename, use_peer_discovery=False, peer_url=None):
    """
    Descargar un archivo del sistema P2P.
    
    Args:
        maestro_url: URL del servidor Maestro
        filename: Nombre del archivo a descargar
        use_peer_discovery: Si usar descubrimiento peer-to-peer en lugar del Maestro
        peer_url: URL del peer a consultar (si use_peer_discovery es True)
    """
    if use_peer_discovery and peer_url:
        peers = locate_via_peer(peer_url, filename)
    else:
        peers = locate(maestro_url, filename)
    
    if not peers:
        print("Archivo no encontrado en ningún peer")
        return
        
    for peer in peers:
        host = urlparse(peer["rest"]).hostname
        grpc_port = peer["grpc_port"]
        resp = download_from_peer(host, grpc_port, filename)
        if resp.ok:
            print(f"Descargado desde {peer['rest']}: {len(resp.content)} bytes")
            with open(f"downloaded_{filename}", "wb") as f:
                f.write(resp.content)
            return
        else:
            print("Peer respondió error:", resp.message)
    print("No se pudo descargar el archivo")

def request_upload(peer_url, grpc_port, filename, filepath):
    """
    Subir un archivo a un peer específico.
    
    Args:
        peer_url: URL del peer destino
        grpc_port: Puerto gRPC del peer
        filename: Nombre del archivo en el destino
        filepath: Ruta local del archivo a subir
    """
    try:
        with open(filepath, "rb") as f:
            content = f.read()
        
        host = urlparse(peer_url).hostname
        resp = upload_to_peer(host, grpc_port, filename, content)
        
        if resp.ok:
            print(f"Archivo {filename} subido exitosamente a {peer_url}")
        else:
            print(f"Error subiendo archivo: {resp.message}")
    except Exception as e:
        print(f"Error subiendo archivo: {e}")

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Cliente P2P para transferencia de archivos")
    parser.add_argument("--maestro", default="http://localhost:9000", help="URL del servidor Maestro")
    parser.add_argument("--action", choices=["download", "upload", "locate"], required=True, help="Acción a realizar")
    parser.add_argument("--file", required=True, help="Nombre del archivo")
    parser.add_argument("--peer", help="URL del peer (para upload o peer discovery)")
    parser.add_argument("--grpc-port", type=int, help="Puerto gRPC (para upload)")
    parser.add_argument("--filepath", help="Ruta local del archivo (para upload)")
    parser.add_argument("--use-peer", action="store_true", help="Usar descubrimiento peer-to-peer")
    
    args = parser.parse_args()
    
    if args.action == "download":
        request_download(args.maestro, args.file, args.use_peer, args.peer)
    elif args.action == "upload":
        if not args.peer or not args.grpc_port or not args.filepath:
            print("Para upload necesitas --peer, --grpc-port y --filepath")
        else:
            request_upload(args.peer, args.grpc_port, args.file, args.filepath)
    elif args.action == "locate":
        if args.use_peer and args.peer:
            peers = locate_via_peer(args.peer, args.file)
        else:
            peers = locate(args.maestro, args.file)
        print(f"Archivo '{args.file}' encontrado en: {peers}")

