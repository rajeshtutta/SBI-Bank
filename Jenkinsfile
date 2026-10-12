pipeline {
    agent any

    options {
        timeout(time: 45, unit: 'MINUTES')
        timestamps()
        disableConcurrentBuilds()
    }

    environment {
        AWS_DEFAULT_REGION = 'ap-south-1'
        EKS_CLUSTER        = 'securebank-eks'
        IMAGE_NAME         = 'sbi-bank'
        K8S_NAMESPACE      = 'securebank'
    }

    stages {

        stage('Checkout GitHub') {
            steps {
                git branch: 'main',
                    url: 'https://github.com/rajeshtutta/SBI-Bank.git'
            }
        }

        stage('Gitleaks Secret Scan') {
            steps {
                sh '''
                    docker run --rm \
                      --volumes-from jenkins \
                      -w "$WORKSPACE" \
                      zricethezav/gitleaks:latest \
                      detect --source . --no-git --redact --exit-code 1
                '''
            }
        }

        stage('Check Node.js and npm') {
            steps {
                sh '''
                    docker run --rm node:20-alpine node --version
                    docker run --rm node:20-alpine npm --version
                '''
            }
        }

stage('Install Dependencies') {
    steps {
        sh '''
            # Remove old dependencies and reinstall cleanly
            docker run --rm \
              --user root \
              --volumes-from jenkins \
              -w "$WORKSPACE" \
              node:20-alpine \
              sh -c 'rm -rf node_modules && npm ci'

            # Restore workspace ownership for Jenkins user
            docker run --rm \
              --user root \
              --volumes-from jenkins \
              -w "$WORKSPACE" \
              node:20-alpine \
              chown -R 1000:1000 node_modules
        '''
    }
}
        stage('SCA - npm Audit') {
            steps {
                sh '''
                    docker run --rm --user 1000:1000 \
                      --volumes-from jenkins \
                      -w "$WORKSPACE" \
                      node:20-alpine npm audit --audit-level=high
                '''
            }
        }

        stage('OWASP Dependency Check') {
            steps {
                withCredentials([
                    string(
                        credentialsId: 'nvd-api-key',
                        variable: 'NVD_API_KEY'
                    )
                ]) {
                    sh '''
                        set +x
                        mkdir -p dependency-check-report

                        docker run --rm \
                          --user root \
                          --volumes-from jenkins \
                          -v dependency-check-data:/usr/share/dependency-check/data \
                          -w "$WORKSPACE" \
                          owasp/dependency-check:latest \
                          --project SBI-Bank \
                          --scan package.json \
                          --scan package-lock.json \
                          --format HTML \
                          --nvdApiKey "$NVD_API_KEY" \
                          --out dependency-check-report
                    '''
                }
            }
            post {
                always {
                    archiveArtifacts(
                        artifacts: 'dependency-check-report/**',
                        allowEmptyArchive: true,
                        fingerprint: true
                    )
                }
            }
        }

        stage('SAST - SonarQube Analysis') {
            steps {
                withSonarQubeEnv('SonarQube') {
                    withCredentials([
                        string(
                            credentialsId: 'sonarqube-token',
                            variable: 'SONAR_TOKEN'
                        )
                    ]) {
                        sh '''
                            set +x

                            docker run --rm \
                            --volumes-from jenkins \
                            -v "$WORKSPACE:/usr/src" \
                            -w /usr/src \
                            -e SONAR_HOST_URL="$SONAR_HOST_URL" \
                            -e SONAR_TOKEN \
                             sonarsource/sonar-scanner-cli:latest \
                            -Dsonar.projectKey=SBI-Bank \
                            -Dsonar.projectName=SBI-Bank \
                            -Dsonar.sources=. \
                            -Dsonar.working.directory=.scannerwork \
                            -Dsonar.exclusions=node_modules/**,coverage/**,dependency-check-report/** \
                            -Dsonar.scm.disabled=true
                            '''
                    }
                }
            }
        }

        stage('Run Unit Tests') {
            steps {
                sh '''
                    docker run --rm --user 1000:1000 \
                      --volumes-from jenkins \
                      -w "$WORKSPACE" \
                      node:20-alpine npm test
                '''
            }
        }

        stage('Build Docker Image') {
            steps {
                sh '''
                    docker build \
                      -t ${IMAGE_NAME}:${BUILD_NUMBER} \
                      -t ${IMAGE_NAME}:latest .
                '''
            }
        }

        stage('Trivy Image Scan') {
            steps {
                sh '''
                    docker run --rm \
                      -v /var/run/docker.sock:/var/run/docker.sock \
                      -v trivy-cache:/root/.cache/ \
                      aquasec/trivy:latest \
                      image \
                      --scanners vuln \
                      --severity HIGH,CRITICAL \
                      --exit-code 0 \
                      --format table \
                      ${IMAGE_NAME}:${BUILD_NUMBER}
                '''
            }
        }

        stage('Push Image to Docker Hub') {
            steps {
                withCredentials([
                    usernamePassword(
                        credentialsId: 'dockerhub-creds',
                        usernameVariable: 'DOCKERHUB_USER',
                        passwordVariable: 'DOCKERHUB_TOKEN'
                    )
                ]) {
                    sh '''
                        set +x

                        IMAGE="$DOCKERHUB_USER/$IMAGE_NAME"

                        printf '%s' "$DOCKERHUB_TOKEN" | \
                          docker login \
                            --username "$DOCKERHUB_USER" \
                            --password-stdin

                        docker tag ${IMAGE_NAME}:${BUILD_NUMBER} \
                          "$IMAGE:${BUILD_NUMBER}"

                        docker tag ${IMAGE_NAME}:${BUILD_NUMBER} \
                          "$IMAGE:latest"

                        docker push "$IMAGE:${BUILD_NUMBER}"
                        docker push "$IMAGE:latest"

                        docker logout
                    '''
                }
            }
        }

        

stage('Create EKS Cluster') {
    steps {
        withCredentials([[
            $class: 'AmazonWebServicesCredentialsBinding',
            credentialsId: 'aws_creds'
        ]]) {
            sh '''
                set +x

                CLUSTER_NAME="securebank-eks"
                AWS_REGION="ap-south-1"
                CLUSTER_ROLE_ARN="arn:aws:iam::379367335704:role/securebank-eks-cluster-role"

                if docker run --rm \
                    -e AWS_ACCESS_KEY_ID \
                    -e AWS_SECRET_ACCESS_KEY \
                    -e AWS_SESSION_TOKEN \
                    -e AWS_DEFAULT_REGION="$AWS_REGION" \
                    public.ecr.aws/aws-cli/aws-cli:latest \
                    eks describe-cluster \
                    --name "$CLUSTER_NAME" \
                    --region "$AWS_REGION" \
                    >/dev/null 2>&1; then

                    echo "EKS cluster already exists."

                else
                    echo "Creating EKS cluster..."

                    docker run --rm \
                        -e AWS_ACCESS_KEY_ID \
                        -e AWS_SECRET_ACCESS_KEY \
                        -e AWS_SESSION_TOKEN \
                        -e AWS_DEFAULT_REGION="$AWS_REGION" \
                        public.ecr.aws/aws-cli/aws-cli:latest \
                        eks create-cluster \
                        --name "$CLUSTER_NAME" \
                        --region "$AWS_REGION" \
                        --role-arn "$CLUSTER_ROLE_ARN" \
                        --resources-vpc-config \
                        subnetIds=subnet-08c52e76b8d01fec1,subnet-01d3ce46e0e95325c
fi
            '''
        }
    }
}

        
stage('Wait for EKS Cluster') {
    steps {
        withCredentials([[
            $class: 'AmazonWebServicesCredentialsBinding',
            credentialsId: 'aws_creds'
        ]]) {
            sh '''
                set +x

                docker run --rm \
                  -e AWS_ACCESS_KEY_ID \
                  -e AWS_SECRET_ACCESS_KEY \
                  -e AWS_SESSION_TOKEN \
                  -e AWS_DEFAULT_REGION="ap-south-1" \
                  public.ecr.aws/aws-cli/aws-cli:latest \
                  eks wait cluster-active \
                  --name securebank-eks \
                  --region ap-south-1

                echo "EKS cluster is ACTIVE."
            '''
        }
    }
}

        
stage('Create EKS Node Group') {
    steps {
        withCredentials([[
            $class: 'AmazonWebServicesCredentialsBinding',
            credentialsId: 'aws_creds'
        ]]) {
            sh '''
                set +x

                CLUSTER_NAME="securebank-eks"
                NODEGROUP_NAME="securebank-nodes"
                AWS_REGION="ap-south-1"
                NODE_ROLE_ARN="arn:aws:iam::379367335704:role/securebank-node-role"

                AWS_CLI="docker run --rm \
                  -e AWS_ACCESS_KEY_ID \
                  -e AWS_SECRET_ACCESS_KEY \
                  -e AWS_SESSION_TOKEN \
                  -e AWS_DEFAULT_REGION=$AWS_REGION \
                  public.ecr.aws/aws-cli/aws-cli:latest"

                if $AWS_CLI eks describe-nodegroup \
                    --cluster-name "$CLUSTER_NAME" \
                    --nodegroup-name "$NODEGROUP_NAME" \
                    --region "$AWS_REGION" >/dev/null 2>&1; then

                    echo "Node group already exists."
                else
                    echo "Creating EKS node group..."

                    $AWS_CLI eks create-nodegroup \
                      --cluster-name "$CLUSTER_NAME" \
                      --nodegroup-name "$NODEGROUP_NAME" \
                      --region "$AWS_REGION" \
                      --node-role "$NODE_ROLE_ARN" \
                      --subnets subnet-00e4fa9d7e2ab63fc subnet-023160aa2de72101e \
                      --instance-types t3.medium \
                      --scaling-config minSize=1,maxSize=2,desiredSize=2 \
                      --ami-type AL2023_x86_64_STANDARD \
                      --capacity-type ON_DEMAND
                fi

                echo "Waiting for node group to become ACTIVE..."

                $AWS_CLI eks wait nodegroup-active \
                  --cluster-name "$CLUSTER_NAME" \
                  --nodegroup-name "$NODEGROUP_NAME" \
                  --region "$AWS_REGION"

                echo "EKS node group is ACTIVE."
            '''
        }
    }
}


        stage('Deploy to EKS') {
            steps {
                withCredentials([
                    [
                        $class: 'AmazonWebServicesCredentialsBinding',
                        credentialsId: 'aws_creds'
                    ],
                    usernamePassword(
                        credentialsId: 'dockerhub-creds',
                        usernameVariable: 'DOCKERHUB_USER',
                        passwordVariable: 'DOCKERHUB_TOKEN'
                    )
                ]) {
                    sh '''
                        set +x

                        mkdir -p "$WORKSPACE/.kube"

                        # Generate EKS kubeconfig
                        docker run --rm \
                          --volumes-from jenkins \
                          -w "$WORKSPACE" \
                          -e AWS_ACCESS_KEY_ID \
                          -e AWS_SECRET_ACCESS_KEY \
                          -e AWS_SESSION_TOKEN \
                          -e AWS_DEFAULT_REGION \
                          public.ecr.aws/aws-cli/aws-cli:latest \
                          eks update-kubeconfig \
                          --region "$AWS_DEFAULT_REGION" \
                          --name "$EKS_CLUSTER" \
                          --kubeconfig "$WORKSPACE/.kube/config"

                        chmod 644 "$WORKSPACE/.kube/config"

                        # Generate temporary EKS authentication token
                        EKS_TOKEN=$(docker run --rm \
                          -e AWS_ACCESS_KEY_ID \
                          -e AWS_SECRET_ACCESS_KEY \
                          -e AWS_SESSION_TOKEN \
                          -e AWS_DEFAULT_REGION \
                          public.ecr.aws/aws-cli/aws-cli:latest \
                          eks get-token \
                          --region "$AWS_DEFAULT_REGION" \
                          --cluster-name "$EKS_CLUSTER" \
                          --query 'status.token' \
                          --output text)

                        export EKS_TOKEN
                        export KUBECONFIG="$WORKSPACE/.kube/config"

                        # Deploy PostgreSQL
                        docker run --rm \
                          --volumes-from jenkins \
                          -w "$WORKSPACE" \
                          -e KUBECONFIG \
                          -e EKS_TOKEN \
                          bitnami/kubectl:latest \
                          --token "$EKS_TOKEN" \
                          apply -f k8s/postgres.yaml

                        # Wait for PostgreSQL
                        docker run --rm \
                          --volumes-from jenkins \
                          -w "$WORKSPACE" \
                          -e KUBECONFIG \
                          -e EKS_TOKEN \
                          bitnami/kubectl:latest \
                          --token "$EKS_TOKEN" \
                          rollout status deployment/postgres \
                          -n "$K8S_NAMESPACE" \
                          --timeout=180s

                        # Deploy application manifests
                        docker run --rm \
                          --volumes-from jenkins \
                          -w "$WORKSPACE" \
                          -e KUBECONFIG \
                          -e EKS_TOKEN \
                          bitnami/kubectl:latest \
                          --token "$EKS_TOKEN" \
                          apply -f k8s/app.yaml

                        # Update deployment to use Docker Hub image
                        docker run --rm \
                          --volumes-from jenkins \
                          -w "$WORKSPACE" \
                          -e KUBECONFIG \
                          -e EKS_TOKEN \
                          bitnami/kubectl:latest \
                          --token "$EKS_TOKEN" \
                          set image deployment/securebank-app \
                          securebank-app="$DOCKERHUB_USER/$IMAGE_NAME:$BUILD_NUMBER" \
                          -n "$K8S_NAMESPACE"

                        # Wait for application rollout
                        docker run --rm \
                          --volumes-from jenkins \
                          -w "$WORKSPACE" \
                          -e KUBECONFIG \
                          -e EKS_TOKEN \
                          bitnami/kubectl:latest \
                          --token "$EKS_TOKEN" \
                          rollout status deployment/securebank-app \
                          -n "$K8S_NAMESPACE" \
                          --timeout=300s

                        # Display application pods
                        docker run --rm \
                          --volumes-from jenkins \
                          -w "$WORKSPACE" \
                          -e KUBECONFIG \
                          -e EKS_TOKEN \
                          bitnami/kubectl:latest \
                          --token "$EKS_TOKEN" \
                          get pods -n "$K8S_NAMESPACE"

                        # Display application LoadBalancer service
                        docker run --rm \
                          --volumes-from jenkins \
                          -w "$WORKSPACE" \
                          -e KUBECONFIG \
                          -e EKS_TOKEN \
                          bitnami/kubectl:latest \
                          --token "$EKS_TOKEN" \
                          get service securebank-app \
                          -n "$K8S_NAMESPACE"
                    '''
                }
            }
        }
    }

    post {
        always {
            sh '''
                docker logout >/dev/null 2>&1 || true
                docker image prune -f || true
            '''
            echo 'SBI Bank DevSecOps pipeline execution finished.'
        }

        success {
            echo 'SBI Bank DevSecOps pipeline completed successfully.'
        }

        failure {
            echo 'Pipeline failed. Check Console Output.'
        }
    }
}
