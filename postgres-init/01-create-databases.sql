-- Create per-service databases on first postgres container startup.
-- Runs once when the postgres data volume is empty (docker-entrypoint-initdb.d behavior).
CREATE DATABASE orders_db;
CREATE DATABASE inventory_db;
CREATE DATABASE payments_db;
