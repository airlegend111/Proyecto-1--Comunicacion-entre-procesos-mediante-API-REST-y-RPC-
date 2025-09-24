import threading, argparse, uvicorn
import server_rest
import server_grpc

def run_rest(config_path):
    server_rest.init_config(config_path)
    cfg = server_rest.CONFIG
    uvicorn.run(server_rest.app, host=cfg["ip"], port=cfg["port"])

def run_grpc(config_path):
    server_grpc.serve(config_path)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    args = parser.parse_args()

    t1 = threading.Thread(target=run_rest, args=(args.config,), daemon=True)
    t2 = threading.Thread(target=run_grpc, args=(args.config,), daemon=True)

    t1.start()
    t2.start()

    t1.join()
    t2.join()
