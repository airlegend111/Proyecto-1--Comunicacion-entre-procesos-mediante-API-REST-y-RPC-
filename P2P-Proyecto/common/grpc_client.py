"""
Common gRPC client utilities for P2P file operations
"""
import grpc
import os
import sys

# Agregar el directorio padre al path para importar files_pb2
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

import files_pb2
import files_pb2_grpc

def download_from_peer(host, grpc_port, filename):
    """
    Download a file from a peer using gRPC.
    
    Args:
        host (str): The hostname/IP of the peer
        grpc_port (int): The gRPC port of the peer
        filename (str): The name of the file to download
        
    Returns:
        DownloadResponse: The response from the peer
    """
    try:
        with grpc.insecure_channel(f"{host}:{grpc_port}") as channel:
            stub = files_pb2_grpc.FileServiceStub(channel)
            request = files_pb2.DownloadRequest(filename=filename)
            response = stub.Download(request)
            return response
    except Exception as e:
        # Return a failed response if connection fails
        return files_pb2.DownloadResponse(
            ok=False, 
            content=b"", 
            message=f"Connection error: {str(e)}"
        )

def upload_to_peer(host, grpc_port, filename, content):
    """
    Upload a file to a peer using gRPC.
    
    Args:
        host (str): The hostname/IP of the peer
        grpc_port (int): The gRPC port of the peer
        filename (str): The name of the file to upload
        content (bytes): The file content as bytes
        
    Returns:
        UploadResponse: The response from the peer
    """
    try:
        with grpc.insecure_channel(f"{host}:{grpc_port}") as channel:
            stub = files_pb2_grpc.FileServiceStub(channel)
            request = files_pb2.UploadRequest(filename=filename, content=content)
            response = stub.Upload(request)
            return response
    except Exception as e:
        # Return a failed response if connection fails
        return files_pb2.UploadResponse(
            ok=False, 
            message=f"Connection error: {str(e)}"
        )

def test_peer_connection(host, grpc_port):
    """
    Test if a peer is reachable via gRPC.
    
    Args:
        host (str): The hostname/IP of the peer
        grpc_port (int): The gRPC port of the peer
        
    Returns:
        bool: True if peer is reachable, False otherwise
    """
    try:
        with grpc.insecure_channel(f"{host}:{grpc_port}") as channel:
            # Try to create a stub and make a simple call
            # This will fail if the service is not available
            stub = files_pb2_grpc.FileServiceStub(channel)
            # We'll attempt a download of a non-existent file just to test connectivity
            request = files_pb2.DownloadRequest(filename="__test_connection__")
            response = stub.Download(request, timeout=5)  # 5 second timeout
            return True
    except Exception:
        return False