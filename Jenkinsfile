pipeline {
  agent any

  options {
    timestamps()
    timeout(time: 30, unit: 'MINUTES')
    buildDiscarder(logRotator(numToKeepStr: '20'))
    disableConcurrentBuilds()
    parallelsAlwaysFailFast()
  }

  parameters {
    booleanParam(
      name: 'DEPLOY',
      defaultValue: false,
      description: 'After a green CI run, rebuild and restart docker compose on this agent',
    )
  }

  environment {
    CI = 'true'
    COMPOSE_DOCKER_CLI_BUILD = '1'
    DOCKER_BUILDKIT = '1'
    NODE_IMAGE = 'node:22-bookworm'
  }

  stages {
    stage('CI') {
      parallel {
        stage('API') {
          agent {
            docker {
              image "${NODE_IMAGE}"
              reuseNode true
              args '-u root:root'
            }
          }
          steps {
            dir('api') {
              sh 'node --version && npm ci'
              sh 'npm run test:ci'
              sh 'npm run build'
            }
          }
        }

        stage('Web') {
          agent {
            docker {
              image "${NODE_IMAGE}"
              reuseNode true
              args '-u root:root'
            }
          }
          steps {
            dir('web') {
              sh 'node --version && npm ci'
              sh 'npm run build'
            }
          }
        }
      }
    }

    stage('Docker images') {
      when {
        anyOf {
          branch 'master'
          expression { (env.GIT_BRANCH ?: '') == 'origin/master' }
          expression { params.DEPLOY }
        }
      }
      steps {
        sh 'docker compose build'
      }
    }

    stage('Deploy') {
      when {
        beforeAgent true
        expression { params.DEPLOY }
      }
      steps {
        sh '''
          set -eu
          if [ ! -f firebase-service-account.json ]; then
            cp firebase-service-account.json.example firebase-service-account.json
            echo "Using example Firebase credentials (FCM will report ready=false)"
          fi
          if [ ! -f .env ] && [ -f .env.example ]; then
            cp .env.example .env
          fi
          docker compose up -d --build
        '''
        sh '''
          set -eu
          port="${WEB_PORT:-8089}"
          url="http://127.0.0.1:${port}/api/health"
          echo "Waiting for ${url}"
          i=0
          while [ "$i" -lt 30 ]; do
            if curl -fsS "$url" | grep -q '"ok"'; then
              echo "Health check passed"
              exit 0
            fi
            i=$((i + 1))
            sleep 2
          done
          echo "Health check failed"
          docker compose ps
          docker compose logs --tail=80
          exit 1
        '''
      }
    }
  }

  post {
    always {
      junit allowEmptyResults: true, testResults: 'api/junit.xml'
    }
    success {
      echo 'UMPIRE CI passed'
    }
    failure {
      echo 'UMPIRE CI failed — see stage logs and api/junit.xml'
    }
  }
}
