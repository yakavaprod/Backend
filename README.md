# YA KAVA backend

The API uses MongoDB as its only source of truth. It does not seed or fall back to demo data.

## Run

1. Copy `.env.example` to `.env` and set `MONGODB_URI` and a long `JWT_SECRET`.
2. Run `npm install`.
3. Run `npm start`.

The API listens on `http://localhost:5000` by default. Set `VITE_API_URL` in the frontend when using another URL.

## Main endpoints

- `POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/auth/me`
- `GET /api/products`, `GET /api/products/:id`
- `GET /api/cart`, `POST /api/cart/items`, `DELETE /api/cart/items/:productId`
- `POST /api/orders`, `GET /api/orders`
- `GET /api/dashboard`
- `GET /api/reviews/:productId`, `POST /api/reviews/:productId`
- Admin routes under `/api/admin/*` require a database user with `role: "admin"`.

Send the access token returned by auth as `Authorization: Bearer <token>`.
