#!/bin/sh
echo Reloading Gogh Daemon...;
cp -rf /root/server/gogh-oracle.service /etc/systemd/system
cp -rf /root/server/gogh-server.service /etc/systemd/system
systemctl daemon-reload
systemctl restart gogh-oracle.service
systemctl restart gogh-server.service
echo Done.