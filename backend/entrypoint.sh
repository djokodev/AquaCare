#!/bin/bash
set -e

echo "Waiting for PostgreSQL..."
while ! nc -z $POSTGRES_HOST $POSTGRES_PORT; do
  sleep 0.5
done
echo "PostgreSQL is ready!"

echo "Running database migrations (with --fake-initial to tolerate existing tables)..."
python manage.py migrate --noinput --fake-initial

echo "Creating superuser from environment variables..."
python manage.py create_superuser_from_env || echo "Warning: Superuser creation skipped or already exists"

echo "Configuring RBAC groups and permissions..."
python manage.py setup_rbac || echo "Warning: RBAC setup failed or already configured"

echo "Collecting static files..."
python manage.py collectstatic --noinput --clear

# Charger les donn?es nutritionnelles (cr?ation via ORM)
echo "Loading nutritional guides..."
python manage.py load_nutritional_data || echo "Warning: nutritional data already loaded or error occurred"

# Charger les produits AquaCare (27 produits : 18 Aller Aqua + 9 DIBAQ)
echo "Loading AquaCare product catalog..."
python manage.py load_products || echo "Warning: product catalog already loaded or error occurred"

echo "=========================="
echo "AquaCare API is Ready"
echo "=========================="

exec "$@"
