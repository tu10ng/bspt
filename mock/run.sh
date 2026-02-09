#!/bin/bash
# VRP Mock Server 启动脚本
# 默认端口 2323，可通过环境变量 PORT 修改

cd "$(dirname "$0")"

PORT=${PORT:-2323}
HOST=${HOST:-0.0.0.0}

echo "Starting VRP Mock Server on ${HOST}:${PORT}"
echo "Press Ctrl+C to stop"
echo ""

python3 -c "
import asyncio
from vrp_mock.server import VRPMockServer

server = VRPMockServer(host='${HOST}', port=${PORT})
asyncio.run(server.start())
"
