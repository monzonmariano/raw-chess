import asyncio
import websockets
import json
import uuid
import random
import string
import os
import http

waiting_lines = {'5': [], '10': [], '15': [], '30': [], '60': []}
rooms = {}
player_to_room = {}
player_names = {} 
private_rooms = {} 


# ---------------- FUNCION INTERCEPTORA ----------------------
async def process_request(path, request_headers):
    # Si alguien (como el cron job) hace un ping a la ruta principal o a /ping
    if path == "/" or path == "/ping":
        # Le devolvemos un 200 OK con un mensajito, sin iniciar WebSocket
        return (http.HTTPStatus.OK, [], b"Raw Chess Server is awake!")
    
    # Si es otra ruta o el juego conectándose, retornamos None
    # (Esto le dice a la librería: "Deja pasar la conexión, es un WebSocket")
    return None

def generate_room_code():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=5))

async def chess_server(websocket):
    print(f"🟢 ¡Nueva conexión detectada desde la app!", flush=True)
    try:
        async for message in websocket:
            data = json.loads(message)
            player_name = data.get('name', 'Guest')
            player_names[websocket] = player_name
            
            if data.get('type') == 'join':
                time_pref = str(data['time'])
                if time_pref not in waiting_lines:
                    waiting_lines[time_pref] = []
                
                # --- FIX FANTASMA 1: Evitar clones ---
                # Si el jugador envía 'join' varias veces, lo borramos primero
                # de todas las listas para asegurarnos de que solo exista una vez.
                for t in waiting_lines:
                    if websocket in waiting_lines[t]:
                        waiting_lines[t].remove(websocket)
                
                # Ahora sí, lo anotamos en la cola de forma segura
                waiting_lines[time_pref].append(websocket)
                
                if len(waiting_lines[time_pref]) >= 2:
                    p1 = waiting_lines[time_pref].pop(0)
                    p2 = waiting_lines[time_pref].pop(0)
                    
                    room_id = str(uuid.uuid4())[:8]
                    rooms[room_id] = {'w': p1, 'b': p2}
                    player_to_room[p1] = room_id
                    player_to_room[p2] = room_id
                    
                    await p1.send(json.dumps({"type": "init", "color": "w", "opponent_name": player_names[p2], "time": time_pref}))
                    await p2.send(json.dumps({"type": "init", "color": "b", "opponent_name": player_names[p1], "time": time_pref}))

            # --- FIX FANTASMA 2: Manejar la orden de cancelar ---
            # Si el frontend envía una cancelación explícita, limpiamos su rastro
            elif data.get('type') == 'cancel':
                for t in waiting_lines:
                    if websocket in waiting_lines[t]:
                        waiting_lines[t].remove(websocket)
                
                for code, room_data in list(private_rooms.items()):
                    if room_data['ws'] == websocket:
                        del private_rooms[code]

            elif data.get('type') == 'create_private':
                custom_code = data.get('custom_code', '').upper()
                time_pref = str(data.get('time', '5')) 
                
                if custom_code:
                    if custom_code in private_rooms:
                        await websocket.send(json.dumps({"type": "error", "message": "That secret room code is already in use. Please choose another!"}))
                        continue 
                    code = custom_code
                else:
                    code = generate_room_code()
                    while code in private_rooms:
                        code = generate_room_code()
                    
                private_rooms[code] = {'ws': websocket, 'time': time_pref}
                await websocket.send(json.dumps({"type": "room_created", "code": code}))

            elif data.get('type') == 'join_private':
                code = data.get('code', '').upper()
                if code in private_rooms:
                    room_data = private_rooms.pop(code) 
                    p1 = room_data['ws']
                    match_time = room_data['time'] 
                    p2 = websocket
                    
                    # FIX DE SEGURIDAD EXTRA: Evitar que seas host e invitado al mismo tiempo
                    if p1 == p2:
                        await websocket.send(json.dumps({"type": "error", "message": "No puedes unirte a tu propia sala."}))
                        private_rooms[code] = room_data # Restauramos la sala
                        continue
                    
                    room_id = str(uuid.uuid4())[:8]
                    rooms[room_id] = {'w': p1, 'b': p2}
                    player_to_room[p1] = room_id
                    player_to_room[p2] = room_id
                    3. Agrégalo al inicio de tu servido
                    await p1.send(json.dumps({"type": "init", "color": "w", "opponent_name": player_names[p2], "time": match_time}))
                    await p2.send(json.dumps({"type": "init", "color": "b", "opponent_name": player_names[p1], "time": match_time}))
                else:
                    await websocket.send(json.dumps({"type": "error", "message": "Room not found."}))
                        
            elif websocket in player_to_room:
                room_id = player_to_room[websocket]
                room = rooms[room_id]
                opponent = room['b'] if room['w'] == websocket else room['w']
                
                if opponent is not None:
                    await opponent.send(message)
                    
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        for time_pref in waiting_lines:
            if websocket in waiting_lines[time_pref]:
                waiting_lines[time_pref].remove(websocket)
                
        for code, room_data in list(private_rooms.items()):
            if room_data['ws'] == websocket:
                del private_rooms[code]
                
        if websocket in player_to_room:
            room_id = player_to_room[websocket]
            room = rooms.get(room_id)
            
            if room:
                opponent = room['b'] if room['w'] == websocket else room['w']
                if opponent is not None:
                    try:
                        await opponent.send(json.dumps({"type": "disconnect"}))
                    except:
                        pass
                
                if room['w'] == websocket: room['w'] = None
                elif room['b'] == websocket: room['b'] = None
                
                if room['w'] is None and room['b'] is None:
                    del rooms[room_id]
            del player_to_room[websocket]
            
        if websocket in player_names:
            del player_names[websocket]

async def main():
    port = int(os.environ.get("PORT", 8001))
    
    async with websockets.serve(chess_server, "0.0.0.0", port, process_request=process_request):
        print(f"Raw Chess Server 2.0 active on port {port}")
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())

#to commit