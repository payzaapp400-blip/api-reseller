# API Reseller - Vehicle Info Trial System

Vehicle info API ko trial ke saath resell karne ka system.

## Kaise Kaam Karta Hai

1. Tum unlimited API use karte ho (FF4KC key)
2. Users ko trial dete ho (limited time)
3. User link mein vehicle number daalta hai, details milti hai

## User Link Format

```
https://tumhara-server.onrender.com/api.php?key=USERKEY&cmd=vehicleinfo&query=VEHICLE_NUMBER
```

## Admin Panel

```
https://tumhara-server.onrender.com/admin
```

Admin password: `admin123` (server.js mein change karo)

## Local Run

```
npm install
node server.js
```

## Deploy on Render

1. GitHub pe repo banao
2. Code push karo
3. render.com pe jao
4. "New +" → "Blueprint" → GitHub repo select karo
5. render.yaml auto-detect hoga
6. Deploy karo

## Note

- Render free tier pe disk ephemeral hai (deploy pe reset)
- Trial system temporary hai toh file storage OK
- Permanent storage ke liye database add karna padega
