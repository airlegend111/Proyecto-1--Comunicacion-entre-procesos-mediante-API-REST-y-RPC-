import os, json, requests
from fastapi import FastAPI, HTTPException
from urllib.parse import urlparse

app = FastAPI(title="Peer REST Server")

CONFIG = None
SHARED_DIR = None
PEER_BASE_URL = None
MAESTRO_URL = None

def load_config(path):
    with open(path) as f:
        return json.load(f)

def init_config(config_path):
    global CONFIG, SHARED_DIR, PEER_BASE_URL, MAESTRO_URL
    CONFIG = load_config(config_path)
    SHARED_DIR = CONFIG["shared_dir"]
    os.makedirs(SHARED_DIR, exist_ok=True)
    PEER_BASE_URL = f"http://localhost:9005"
    MAESTRO_URL = CONFIG["maestro_url"]

@app.on_event("startup")
def register():
    files = os.listdir(SHARED_DIR)
    data = {"peer": PEER_BASE_URL, "files": files, "grpc_port": 9006}
    try:
        r = requests.post(f"{MAESTRO_URL}/register", json=data, timeout=5)
        print("Registro en Maestro:", r.json())
    except Exception as e:
        print("Error al registrar en Maestro:", e)

@app.get("/")
def root():
    """
    Endpoint raíz del peer.
    """
    return {"message": f"Peer {CONFIG['id']}", "status": "activo", "archivos": len(os.listdir(SHARED_DIR))}

@app.get("/files")
def list_files():
    return {"peer": CONFIG["id"], "files": os.listdir(SHARED_DIR)}

@app.get("/search")
def search(file: str):
    exists = file in os.listdir(SHARED_DIR)
    return {"peer": CONFIG["id"], "file": file, "exists": exists}

@app.get("/locate")
def locate_via_peer(file: str):
    """
    Locate a file through this peer's network connections.
    This allows peer-to-peer discovery without going through Maestro.
    """
    # First check if we have the file
    files = os.listdir(SHARED_DIR)
    if file in files:
        return {
            "file": file, 
            "peers": [{"rest": PEER_BASE_URL, "grpc_port": CONFIG["grpc_port"]}]
        }
    
    # Check friend peers
    found_peers = []
    
    # Try primary friend
    try:
        primary_url = CONFIG.get("friend_peer_primary")
        if primary_url:
            resp = requests.get(f"{primary_url}/search", params={"file": file}, timeout=3)
            if resp.status_code == 200 and resp.json().get("exists"):
                # Need to get grpc_port from the peer
                peer_info = requests.get(f"{primary_url}/info", timeout=3)
                if peer_info.status_code == 200:
                    grpc_port = peer_info.json().get("grpc_port")
                    found_peers.append({"rest": primary_url, "grpc_port": grpc_port})
    except Exception as e:
        print(f"Error checking primary friend: {e}")
    
    # Try backup friend
    try:
        backup_url = CONFIG.get("friend_peer_backup")
        if backup_url:
            resp = requests.get(f"{backup_url}/search", params={"file": file}, timeout=3)
            if resp.status_code == 200 and resp.json().get("exists"):
                # Need to get grpc_port from the peer
                peer_info = requests.get(f"{backup_url}/info", timeout=3)
                if peer_info.status_code == 200:
                    grpc_port = peer_info.json().get("grpc_port")
                    found_peers.append({"rest": backup_url, "grpc_port": grpc_port})
    except Exception as e:
        print(f"Error checking backup friend: {e}")
    
    # If still not found, try Maestro as fallback
    if not found_peers:
        try:
            resp = requests.get(f"{MAESTRO_URL}/locate", params={"file": file}, timeout=5)
            if resp.status_code == 200:
                found_peers = resp.json().get("peers", [])
        except Exception as e:
            print(f"Error checking Maestro: {e}")
    
    return {"file": file, "peers": found_peers}

@app.get("/info")
def peer_info():
    """
    Return information about this peer.
    """
    return {
        "id": CONFIG["id"],
        "rest_url": PEER_BASE_URL,
        "grpc_port": CONFIG["grpc_port"],
        "files": os.listdir(SHARED_DIR)
    }

@app.post("/refresh")
def refresh_registry():
    """
    Actualiza manualmente el registro con el maestro.
    Útil después de cambios de archivos que no se detectaron automáticamente.
    """
    try:
        files = os.listdir(SHARED_DIR)
        data = {"peer": PEER_BASE_URL, "files": files, "grpc_port": CONFIG["grpc_port"]}
        r = requests.post(f"{MAESTRO_URL}/register", json=data, timeout=5)
        return {"status": "updated", "files": files, "maestro_response": r.json()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error refreshing registry: {e}")

@app.post("/upload")
def upload_file(filename: str, content: bytes):
    """
    REST endpoint for file upload (dummy implementation).
    """
    try:
        path = os.path.join(SHARED_DIR, filename)
        with open(path, "wb") as f:
            f.write(content)
        
        # Re-register with Maestro to update file list
        files = os.listdir(SHARED_DIR)
        data = {"peer": PEER_BASE_URL, "files": files, "grpc_port": 9006}
        requests.post(f"{MAESTRO_URL}/register", json=data, timeout=5)
        
        return {"ok": True, "message": f"File {filename} uploaded successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
