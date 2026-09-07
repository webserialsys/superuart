sudo brew services start socket_vmnet
vm_interface=$(ip -4 route show default | awk 'NR == 1 {print $5}')
echo "$vm_interface"

sudo resolvectl dns "$vm_interface" 1.1.1.1 8.8.8.8
sudo resolvectl domain "$vm_interface" '~.'
sudo resolvectl flush-caches

minikube delete

minikube start --driver=docker --cpus=6
minikube addons enable ingress
minikube addons enable metrics-server

minikube tunnel

kubectl get nodes
kubectl get pods -A

export GHCR_USERNAME="<github-username>"
export GHCR_TOKEN="<github-token-with-read-packages>"

kubectl create secret docker-registry ghcr-secret \
  --docker-server=ghcr.io \
  --docker-username="$GHCR_USERNAME" \
  --docker-password="$GHCR_TOKEN"

kubectl apply -f k8s/

minikube ip

http://<MINIKUBE_IP>/
http://<MINIKUBE_IP>/grafana/

kubectl -n argocd port-forward svc/argocd-server 8443:443
https://127.0.0.1:8443

kubectl port-forward svc/prometheus 9090:9090
http://127.0.0.1:9090