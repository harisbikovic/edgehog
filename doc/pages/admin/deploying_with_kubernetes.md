<!---
  Copyright 2021-2023 SECO Mind Srl

  SPDX-License-Identifier: Apache-2.0
-->

# Deploying with Kubernetes

Edgehog was designed as a Kubernetes native application, this guide will show how to deploy an
Edgehog instance in a Kubernetes cluster.

*Note: currently Edgehog requires some manual initialization operations to be performed in the
Elixir interactive shell and is not completely automated. All required operations are detailed
below in the guide.*

## Requirements

- A Kubernetes cluster
- `kubectl` correctly configured to target the aforementioned cluster
- An Ingress Controller deployed in the cluster (the guide contains examples for the NGINX Ingress
  Controller)
- An Astarte instance, with an existing realm and its private key
- A PostgreSQL database
- S3-compatible storage with its credentials
- The `jq` utility installed in the system
- (Optional) A Google Geolocation API Key
- (Optional) A Google Geocoding API Key
- (Optional) An ipbase.com API Key

The guide does not cover in detail how Edgehog is exposed to the internet, since administrators are
free to use their favorite Ingress Controller to achieve that. An example Ingress using the NGINX
Ingress Controller is provided, but advanced operations (e.g. certificate management) are out of the
scope of this guide.

The guide assumes everything is deployed to the `edgehog` namespace in the Kubernetes cluster, but
Edgehog can be deployed in any namespace adjusting the `yaml` files and the commands accordingly.

All fields that have to be customized will be indicated `<WITH-THIS-SYNTAX>`.

## Deploying Edgehog

This part of the guide will detail all the operations to deploy Edgehog into an existing Kubernetes
cluster.

### Namespace

First of all, the `edgehog` namespace has to be created

```bash
$ kubectl create namespace edgehog
```

### Installing NGINX Ingress Controller and cert-manager (example)

At this point you should install an Ingress Controller in your cluster. As an example, we will show
the procedure to install the NGINX Ingress Controller and cert-manager (to manager SSL certificates)
using `helm`. To do so, use these commands

```bash
$ helm repo add jetstack https://charts.jetstack.io
$ helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
$ helm repo update
$ helm install cert-manager jetstack/cert-manager \
  --create-namespace --namespace cert-manager --set installCRDs=true
$ helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  --create-namespace --namespace ingress-nginx
```

After some minutes, you can retrieve the Load Balancer IP with

```bash
$ kubectl get svc -n ingress-nginx
```

in the `EXTERNAL-IP` column.

Note that NGINX is only one of the possible Ingress Controllers, instructions for other Ingress
Controllers are outside the scope of this guide.

### Creating DNS entries

Once you have the Load Balancer IP (obtained in the [previous
step](#installing-nginx-ingress-controller-and-cert-manager-example)), head to your DNS provider and
point two domains (one for the backend and one for the frontend) to that IP address.

Save the two hosts (e.g. `api.edgehog.example.com` and `edgehog.example.com`) since they're going to
be needed for the following steps.

### Secrets

A series of secrets containing various credentials have to be created.

#### Database connection

This command creates the secret containing the details for the database connection:

```bash
$ kubectl create secret generic -n edgehog edgehog-db-connection \
  --from-literal="database=<DATABASE-NAME>" \
  --from-literal="username=<DATABASE-USER>" \
  --from-literal="password=<DATABASE-PASSWORD>"
```

Values to be replaced
- `DATABASE-NAME`: the name of the PostgreSQL database.
- `DATABASE-USER`: the username to access the database.
- `DATABASE-PASSWORD`: the password to access the database.

#### Secret key base

This command creates the secret key base used by Phoenix:

```bash
$ kubectl create secret generic -n edgehog edgehog-secret-key-base \
  --from-literal="secret-key-base=$(openssl rand -base64 48)"
```

#### S3 Credentials (Google Cloud)

To create an S3-compatbile bucket on Google Cloud to be used with Edgehog, the following steps have
to be performed:

- [Create a service
  account](https://cloud.google.com/iam/docs/creating-managing-service-accounts#creating) in your
  project.

- [Create JSON
credentials](https://cloud.google.com/iam/docs/creating-managing-service-account-keys#creating) for
the service account and rewrite them as a single line JSON:

```bash
$ gcloud iam service-accounts keys create service_account_credentials.json \
  --iam-account=<SERVICE-ACCOUNT-EMAIL>
$ cat service_account_credentials.json | jq -c > s3_credentials.json
```

- [Create a Cloud Storage Bucket](https://cloud.google.com/storage/docs/creating-buckets) on GCP
   * Choose a multiregion in the preferred zones (e.g. Europe)
   * Remove public access prevention
   * Choose a fine-grained Access Control, instead of a uniform one

- After making sure of having the right project selected for the `gcloud` CLI, assign the
`objectAdmin` permission to the service account for the newly created bucket:

```bash
$ gsutil iam ch serviceAccount:<SERVICE-ACCOUNT-EMAIL>:objectAdmin gs://<BUCKET-NAME>
```

- Create a secret containing the service account credentials

```bash
$ kubectl create secret generic -n edgehog edgehog-s3-credentials \
  --from-file="gcp-credentials=s3_credentials.json"
```

Values to be replaced
- `SERVICE-ACCOUNT-EMAIL`: the email associated with the service account.
- `BUCKET-NAME`: the bucket name for the S3 storage.

#### S3 Credentials (Generic)

Consult the documentation of your cloud provider for more details about obtaining an access key ID
and a secret access key for your S3-compatible storage.

This command creates the secret containing the S3 credentials:

```bash
$ kubectl create secret generic -n edgehog edgehog-s3-credentials \
  --from-literal="access-key-id=<ACCESS-KEY-ID>" \
  --from-literal="secret-access-key=<SECRET-ACCESS-KEY>"
```

Values to be replaced
- `ACCESS-KEY-ID`: the access key ID for your S3 storage.
- `SECRET-ACCESS-KEY`: the secret access key for your S3 storage.

#### Google Geolocation API Key (optional)

Activate the Geolocation API for your project in GCP and
[create an API key](https://developers.google.com/maps/documentation/geolocation/get-api-key) to be
used with Google Geolocation.

After that, create the secret containing the API key with:

```bash
$ kubectl create secret generic -n edgehog edgehog-google-geolocation-credentials \
  --from-literal="api-key=<API-KEY>" \
```

Values to be replaced
- `API-KEY`: the Google Geolocation API Key obtained from GCP.

#### Google Geocoding API Key (optional)

Activate the Geocoding API for your project in GCP and
[create an API key](https://developers.google.com/maps/documentation/geocoding/get-api-key) to be
used with Google Geocoding.

After that, create the secret containing the API key with:

```bash
$ kubectl create secret generic -n edgehog edgehog-google-geocoding-credentials \
  --from-literal="api-key=<API-KEY>"
```

Values to be replaced
- `API-KEY`: the Google Geocoding API Key obtained from GCP.

#### ipbase.com API Key (optional)

Register an account at [ipbase.com](https://ipbase.com/) to obtain an API key.

After that, create the secret containing the API key with:

```bash
$ kubectl create secret generic -n edgehog edgehog-ipbase-credentials \
  --from-literal="api-key=<API-KEY>"
```

Values to be replaced
- `API-KEY`: the API Key obtained from ipbase.com.

### Deployments

After secrets are deployed, the deployments can be applied to the cluster.

#### Backend

To deploy the backend, copy the following `yaml` snippet in `backend-deployment.yaml`, fill the
missing values (detailed below) and execute

```bash
$ kubectl apply -f backend-deployment.yaml
```

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    app: edgehog-backend
  name: edgehog-backend
  namespace: edgehog
spec:
  replicas: 1
  selector:
    matchLabels:
      app: edgehog-backend
  template:
    metadata:
      labels:
        app: edgehog-backend
    spec:
      containers:
      - env:
        - name: RELEASE_NAME
          value: edgehog
        - name: PORT
          value: "4000"
        - name: URL_HOST
          value: <BACKEND-HOST>
        - name: DATABASE_HOSTNAME
          value: <DATABASE-HOSTNAME>
        - name: DATABASE_NAME
          valueFrom:
            secretKeyRef:
              key: database
              name: edgehog-db-connection
        - name: DATABASE_USERNAME
          valueFrom:
            secretKeyRef:
              key: username
              name: edgehog-db-connection
        - name: DATABASE_PASSWORD
          valueFrom:
            secretKeyRef:
              key: password
              name: edgehog-db-connection
        - name: SECRET_KEY_BASE
          valueFrom:
            secretKeyRef:
              key: secret-key-base
              name: edgehog-secret-key-base
        - name: MAX_UPLOAD_SIZE_BYTES
          value: "<MAX-UPLOAD-SIZE-BYTES>"

        # Uncomment this env if you have installed an optional ipbase.com API Key in the secrets
        #
        #- name: IPBASE_API_KEY
        #  valueFrom:
        #    secretKeyRef:
        #      key: api-key
        #      name: edgehog-ipbase-credentials

        # Uncomment this env if you have installed an optional Google Geolocation API Key in the
        # secrets
        #
        #- name: GOOGLE_GEOLOCATION_API_KEY
        #  valueFrom:
        #    secretKeyRef:
        #      key: api-key
        #      name: edgehog-google-geolocation-credentials

        # Uncomment these envs if you have installed an optional Google Geocoding API Key in
        # the secrets
        #- name: GOOGLE_GEOCODING_API_KEY
        #  valueFrom:
        #    secretKeyRef:
        #      key: api-key
        #      name: edgehog-google-geocoding-credentials

        - name: S3_GCP_CREDENTIALS
          valueFrom:
            secretKeyRef:
              key: gcp-credentials
              name: edgehog-s3-credentials

        # If you're using another S3 provider which is not Google Cloud, uncomment these envs and
        # delete the previous env
        #
        #- name: S3_ACCESS_KEY_ID
        # valueFrom:
        #   secretKeyRef:
        #     key: access-key-id
        #     name: edgehog-s3-credentials
        #- name: S3_SECRET_ACCESS_KEY
        # valueFrom:
        #   secretKeyRef:
        #     key: secret-access-key
        #     name: edgehog-s3-credentials

        - name: S3_SCHEME
          value: <S3-SCHEME>
        - name: S3_HOST
          value: <S3-HOST>
        - name: S3_PORT
          value: "<S3-PORT>"
        - name: S3_BUCKET
          value: <S3-BUCKET>
        - name: S3_ASSET_HOST
          value: <S3-ASSET-HOST>
        - name: S3_REGION
          value: <S3-REGION>
        image: edgehogdevicemanager/edgehog-backend:snapshot
        imagePullPolicy: Always
        name: edgehog-backend
        ports:
        - containerPort: 4000
          name: http
          protocol: TCP
```

Values to be replaced
- `BACKEND-HOST`: the host of the Edgehog backend (see the [Creating DNS
  entries](#creating-dns-entries) section).
- `DATABASE-HOSTNAME`: the hostname of the PostgreSQL database.
- `MAX-UPLOAD-SIZE-BYTES`: the maximum dimension for uploads, particularly relevant for OTA updates.
  If omitted, it defaults to 4 Gigabytes.
- `S3-SCHEME`: the scheme (`http` or `https`) for the S3 storage.
- `S3-HOST`: the host for the S3 storage.
- `S3-PORT`: the port for the S3 storage. This has to be put in double quotes to force it to be
  interpreted as a string.
- `S3-BUCKET`: the bucket name for the S3 storage.
- `S3-ASSET-HOST`: the asset host for the S3 storage, e.g. `storage.googleapis.com/<S3-BUCKET>` for
  GCP or `<S3-BUCKET>.s3.amazonaws.com` for AWS.
- `S3-REGION`: the region where the S3 storage resides.

The optional env variable in the `yaml` also have to be uncommented where relevant (see comments
above the commented blocks for more information).

#### Frontend

To deploy the frontend, copy the following `yaml` snippet in `frontend-deployment.yaml`, fill the
missing values (detailed below) and execute

```bash
$ kubectl apply -f frontend-deployment.yaml
```

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    app: edgehog-frontend
  name: edgehog-frontend
  namespace: edgehog
spec:
  replicas: 1
  selector:
    matchLabels:
      app: edgehog-frontend
  template:
    metadata:
      labels:
        app: edgehog-frontend
    spec:
      containers:
      - env:
        - name: BACKEND_URL
          value: <BACKEND-HOST>
        image: edgehogdevicemanager/edgehog-frontend:snapshot
        imagePullPolicy: Always
        name: edgehog-frontend
        ports:
        - containerPort: 80
          name: httpout
          protocol: TCP
```

Values to be replaced
- `BACKEND-URL`: the API base URL of the Edgehog backend (see the [Creating DNS
  entries](#creating-dns-entries) section). This should be, e.g., `https://<BACKEND-HOST>`.

### Services

#### Backend

To deploy the backend service, copy the following `yaml` snippet in `backend-service.yaml` and
execute

```bash
$ kubectl apply -f backend-service.yaml
```

```yaml
apiVersion: v1
kind: Service
metadata:
  labels:
    app: edgehog-backend
  name: edgehog-backend
  namespace: edgehog
spec:
  ports:
  - port: 4000
    protocol: TCP
    targetPort: 4000
  selector:
    app: edgehog-backend
```

#### Frontend

To deploy the frontend service, copy the following `yaml` snippet in `frontend-service.yaml` and
execute 

```bash
$ kubectl apply -f frontend-service.yaml
```

```yaml
apiVersion: v1
kind: Service
metadata:
  labels:
    app: edgehog-frontend
  name: edgehog-frontend
  namespace: edgehog
spec:
  ports:
  - port: 80
    protocol: TCP
    targetPort: 80
  selector:
    app: edgehog-frontend
```

### Exposing Edgehog to the Internet

#### SSL Certificates

This is an example certificates configuration for Edgehog. This is provided as a starting point and
it uses `certmanager` to obtain LetsEncrypt SSL certificates. All advanced topics (advanced
certificate management, self-provided certificates) are not discussed here and are outside the scope
of this guide.

First of all, create a `ClusterIssuer` by copying the following `yaml` snippet in
`cluster-issuer.yaml` and executing

```bash
$ kubectl apply -f cluster-issuer.yaml
```

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: <EMAIL-ADDRESS>
    privateKeySecretRef:
      name: letsencrypt
    solvers:
    - http01:
        ingress:
          class: nginx
```

Values to be replaced
- `EMAIL-ADDRESS`: a valid email address that will be used for the ACME account for LetsEncrypt.

After that, create a certificate for your frontend and backend hosts, copying the following `yaml`
snippet in `certificate.yaml` and executing

```bash
$ kubectl apply -f certificate.yaml
```

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: tls-secret
  namespace: edgehog
spec:
  secretName: tls-secret
  dnsNames:
  - <FRONTEND-HOST>
  - <BACKEND-HOST>
  issuerRef:
    group: cert-manager.io
    kind: ClusterIssuer
    name: letsencrypt
```

Values to be replaced
- `FRONTEND-HOST`: the frontend host.
- `BACKEND-HOST`: the backend host.

Note that this step must be performed after DNS for the frontend and backend hosts are correctly
propagated (see [Creating DNS Entries](#creating-dns-entries)).

#### Ingress

This is an example Ingress configuration for Edgehog. This is provided as a starting point and it
uses the NGINX Ingress Controller. All advanced topics (e.g. certificate management) are not discussed here
and are outside the scope of this guide.

Copy this `yaml` snippet to `ingress.yaml` and execute

```bash
$ kubectl apply -f ingress.yaml
```

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt
    kubernetes.io/ingress.class: nginx
    nginx.ingress.kubernetes.io/proxy-body-size: <MAX-UPLOAD-SIZE>
  name: edgehog-ingress
  namespace: edgehog
spec:
  rules:
  - host: <FRONTEND-HOST>
    http:
      paths:
      - backend:
          service:
            name: edgehog-frontend
            port:
              number: 80
        path: /
        pathType: Prefix
  - host: <BACKEND-HOST>
    http:
      paths:
      - backend:
          service:
            name: edgehog-backend
            port:
              number: 4000
        path: /
        pathType: Prefix
  tls:
  - hosts:
    - <FRONTEND-HOST>
    - <BACKEND-HOST>
    secretName: tls-secret
```

Values to be replaced
- `FRONTEND-HOST`: the frontend host.
- `BACKEND-HOST`: the backend host.
- `MAX-UPLOAD-SIZE`: the maximum upload size that you defined in the [Edgehog backend
  deployment](https://edgehog-device-manager.github.io/docs/snapshot/deploying_with_kubernetes.html#deployments).
  Note that NGINX accepts also size suffixes, so you can put, e.g., `4G` for 4 gigabytes. Also note
  that, differently from the value in the Deployment, this is required because NGINX default is 1
  megabyte.

## Edgehog Initialization

These are some manual operation that have to be performed to initialize the Edgehog instance. In the
future these operation will be automated and/or will be performed using a dedicated API.

### Creating a keypair

A keypair is needed to emit and validate tokens to access your tenant. You can generate an EC
keypair with the following OpenSSL commands

```bash
$ openssl ecparam -name prime256v1 -genkey -noout > private_key.pem
$ openssl ec -in private_key.pem -pubout > public_key.pem
```

After those commands are executed, you will have two files: `private_key.pem` and `public_key.pem`.
The content of `public_key.pem` will be needed in the next steps, while `private_key.pem` will be
used to emit Edgehog tokens. Make sure to store the private key somewhere safe.

### Connecting to `iex`

Connect to the `iex` interactive shell of the Edgehog backend using

```bash
$ kubectl exec -it deploy/edgehog-backend -n edgehog -- /app/bin/edgehog remote
```

All the following commands have to be executed inside that shell, in a single session (since some
commands will reuse the result of previous commands)

### Creating the tenant

The following commands will create a database entry representing the tenant, with its associated
Astarte cluster and Realm.

```elixir
iex> alias Edgehog.Provisioning
iex> tenant_name = "<TENANT-NAME>"
iex> tenant_slug = "<TENANT-SLUG>"
iex> tenant_public_key = """
<TENANT-PUBLIC-KEY>
"""
iex> base_api_url = "<ASTARTE-BASE-API-URL>"
iex> realm_name = "<ASTARTE-REALM-NAME>"
iex> realm_private_key = """
<ASTARTE-REALM-PRIVATE-KEY>
"""
iex> {:ok, tenant} = Provisioning.provision_tenant(
  %{
    name: tenant_name,
    slug: tenant_slug,
    public_key: tenant_public_key,
    astarte_config: %{
      base_api_url: base_api_url,
      realm_name: realm_name,
      realm_private_key: realm_private_key
    }
  })
```

Values to be replaced
- `TENANT-NAME`: the name of the new tenant.
- `TENANT-SLUG`: the slug of the tenant, must contain only lowercase letters and hyphens.
- `TENANT-PUBLIC-KEY`: the content of `public_key.pem` created in the [previous
  step](#creating-a-keypair). Open a multiline string with `"""`, press Enter, paste the content of
  the file in the `iex` shell and then close the multiline string with `"""` on a new line.
- `ASTARTE-BASE-API-URL`: the base API url of the Astarte instance (e.g.
  https://api.astarte.example.com).
- `ASTARTE-REALM-NAME`: the name of the Astarte realm you're using.
- `ASTARTE-REALM-PRIVATE-KEY`: the content of you realm's private key. Open a multiline string with
  `"""`, press Enter, paste the content of the file in the `iex` shell and then close the multiline
  string with `"""` on a new line.

### Accessing Edgehog

At this point your Edgehog instance is ready to use. The last step is generating a token to access
your Edgehog frontend instance. You can do so using the `gen-edgehog-jwt` tool contained in the
`tools` directory of the [Edgehog
repo](https://github.com/edgehog-device-manager/edgehog/tree/main/tools).

```bash
$ pip3 install pyjwt
$ ./gen-edgehog-jwt -k <PATH-TO-TENANT-PRIVATE-KEY>
```

Values to be replaced
- `PATH-TO-TENANT-PRIVATE-KEY`: path to the `private_key.pem` file created in the [previous
  step](#creating-a-keypair).

Note that the token expires after 24 hours by default. If you want to have a token with a different
expiry time, you can pass `-e <EXPIRY-SECONDS>` to the `gen-edgehog-jwt` command.

After that, you can open your frontend URL in your browser and insert your tenant slug and token to
log into your Edgehog instance, and use to the [user guide](#intro_user) to discover all Edgehog
features.
