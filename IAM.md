yc init
yc config list
yc iam service-account list
yc iam key create --output iam.json --service-account-name terra-uart               
yc config profile create nazeru
yc config set service-account-key iam.json 
yc iam create-token