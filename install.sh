#!/bin/sh
DIR_PATH=$( cd "$(dirname "${BASH_SOURCE[0]}")" ; pwd -P )

# Install MongoDB
apt update
wget http://archive.ubuntu.com/ubuntu/pool/main/o/openssl/libssl1.1_1.1.1-1ubuntu2.1~18.04.23_amd64.deb
sudo dpkg -i libssl1.1_1.1.1-1ubuntu2.1~18.04.23_amd64.deb
apt install dirmngr gnupg apt-transport-https ca-certificates software-properties-common
wget -qO - https://www.mongodb.org/static/pgp/server-5.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/5.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-5.0.list
apt-get update
apt-get install -y mongodb-org
systemctl start mongod
systemctl enable mongod

# Install node v18.12.1
curl -sL https://deb.nodesource.com/setup_18.x -o nodesource_setup.sh
sudo bash nodesource_setup.sh
sudo apt install nodejs -y
node -v
npm install

# Set the remove host the GIT repo
git remote set-url origin git@github.com:pureflexaidev/gogh-backend.git

# Set default max heap for memory
echo 'export NODE_OPTIONS="--max-old-space-size=16384"' >> ~/.bashrc
source ~/.bashrc

# Create systemd service for Gogh Server
cd $DIR_PATH
cp -rf ./gogh-server.service /etc/systemd/system
systemctl start gogh-server.service 
systemctl enable gogh-server.service
cp -rf ./gogh-oracle.service /etc/systemd/system
systemctl start gogh-oracle.service 
systemctl enable gogh-oracle.service

# Open ports
ufw allow 80
ufw allow 443