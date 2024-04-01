# Create self-signed SSL certificate
openssl req -x509 -newkey rsa:4096 -sha256 -days 3650 \
  -nodes -keyout ./ssl/ssl.key -out ./ssl/ssl.crt