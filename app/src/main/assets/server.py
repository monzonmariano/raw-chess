import asyncio
import websockets
import json
import uuid

waiting_lines = {'5': [], '10': [], '15': []}
rooms = {}
player_to_room = {}

# NEW 1: A dictionary to remember who is who
player_names = {} 

async def chess_server(websocket):
    try:
        async for message in websocket:
            data = json.loads(message)
            
            if data.get('type') == 'join':
                time_pref = str(data['time'])
                
                # NEW 2: Catch the Google name sent by the app (default to Guest if missing)
                player_name = data.get('name', 'Guest')
                player_names[websocket] = player_name
                
                if time_pref in waiting_lines:
                    waiting_lines[time_pref].append(websocket)
                    print(f"{player_name} joined {time_pref}-min queue. Length: {len(waiting_lines[time_pref])}")
                    
                    if len(waiting_lines[time_pref]) >= 2:
                        p1 = waiting_lines[time_pref].pop(0)
                        p2 = waiting_lines[time_pref].pop(0)
                        
                        room_id = str(uuid.uuid4())[:8]
                        rooms[room_id] = {'w': p1, 'b': p2}
                        player_to_room[p1] = room_id
                        player_to_room[p2] = room_id
                        
                        # NEW 3: Grab their real names and introduce them to each other
                        p1_name = player_names[p1]
                        p2_name = player_names[p2]
                        
                        print(f"Match found! {p1_name} vs {p2_name}. Room: {room_id}")
                        
                        await p1.send(json.dumps({"type": "init", "color": "w", "opponent_name": p2_name}))
                        await p2.send(json.dumps({"type": "init", "color": "b", "opponent_name": p1_name}))
                        
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
            
        # NEW 4: Wipe the player's name from memory when they close the app
        if websocket in player_names:
            del player_names[websocket]

async def main():
    async with websockets.serve(chess_server, "0.0.0.0", 8001):
        print("Name-Aware Matchmaker active on port 8001")
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())
