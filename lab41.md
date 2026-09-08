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

kubectl create namespace argocd
kubectl apply -n argocd --server-side --force-conflicts \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/v3.5.2/manifests/install.yaml
  
<!-- kubectl port-forward svc/argocd-server -n argocd 8080:443 -->

kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath='{.data.password}' | base64 --decode
echo

kubectl apply -f argocd/project.yaml
kubectl apply -f argocd/application-superuart.yaml
kubectl apply -f argocd/root-application.yaml