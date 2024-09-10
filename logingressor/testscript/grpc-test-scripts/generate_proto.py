#!/usr/bin/env python3
import os
import subprocess
import sys

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    proto_file = os.path.join(script_dir, '../../pkg/proto/log.proto')
    
    if not os.path.exists(proto_file):
        print(f"Proto file not found: {proto_file}")
        sys.exit(1)
    
    try:
        subprocess.run([
            'python', '-m', 'grpc_tools.protoc',
            f'--proto_path={os.path.dirname(proto_file)}',
            f'--python_out={script_dir}',
            f'--grpc_python_out={script_dir}',
            proto_file
        ], check=True)
        print("Proto files generated successfully")
    except subprocess.CalledProcessError as e:
        print(f"Failed to generate proto files: {e}")
        sys.exit(1)
    except FileNotFoundError:
        print("Error: protoc or grpc_tools not found.")
        print("Please install the required packages with:")
        print("pip install grpcio grpcio-tools")
        sys.exit(1)

if __name__ == "__main__":
    main() 