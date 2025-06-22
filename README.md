# DodoList Docker Setup

This project contains Docker configuration for both development and production environments.

## Production Setup (with Nginx)

The production setup uses Nginx as a reverse proxy to serve the frontend and proxy requests to the backend.

To start the production environment:

```bash
docker-compose up -d
```

Access the application at http://localhost

The PocketBase admin dashboard is available at http://localhost/_/

## Development Setup (with HMR)

The development setup allows for Hot Module Replacement (HMR) for the frontend and direct access to the backend.

To start the development environment:

```bash
docker-compose -f docker-compose.dev.yml up -d
```

Access the frontend at http://localhost:3000
Access the backend directly at http://localhost:8080
Access the PocketBase admin dashboard at http://localhost:8080/_/

## Stopping the Services

To stop the services:

For production:
```bash
docker-compose down
```

For development:
```bash
docker-compose -f docker-compose.dev.yml down
```

To remove volumes as well (this will delete your data):
```bash
docker-compose down -v
# or
docker-compose -f docker-compose.dev.yml down -v
```
