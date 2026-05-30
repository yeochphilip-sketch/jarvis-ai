#serve.py
import ssl, http.server, os

os.chdir('/Users/philipyeo/jarvis')
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain('127.0.0.1+1.pem', '127.0.0.1+1-key.pem')

server = http.server.HTTPServer(('localhost', 5500), http.server.SimpleHTTPRequestHandler)
server.socket = ctx.wrap_socket(server.socket, server_side=True)
print('Serving on https://localhost:5500')
server.serve_forever()
