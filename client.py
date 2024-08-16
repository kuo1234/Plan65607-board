import asyncio
import websockets

async def websocket_client():
    uri = "ws://192.168.0.33:8080"  # 替换为你的 WebSocket 服务器地址和端口
    async with websockets.connect(uri) as websocket:
        # 发送消息到服务器
        await websocket.send("Hello Server!")

        # 接收服务器响应
        response = await websocket.recv()
        print(f"Received from server: {response}")

# 运行 WebSocket 客户端
asyncio.get_event_loop().run_until_complete(websocket_client())