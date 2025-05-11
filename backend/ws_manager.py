import socketio

# Shared Socket.IO server instance
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    async_handlers=True,
    ping_timeout=35000,
    logger=True,
    engineio_logger=True,
)

# Shared dictionary to store mapping of socket IDs (sid) to user IDs
connected_users = {}
