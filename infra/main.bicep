// Azure Container Apps deployment for tokawaPTPQA
// Deploys: Log Analytics Workspace, Container Apps Environment, Container App
// Assumes a Container Registry already exists (built image pushed beforehand)

@description('Azure region for all resources')
param location string = resourceGroup().location

@description('Base name used as prefix for resource names')
param appName string = 'tokawa-ptpqa'

@description('Full image name including tag, e.g. myacr.azurecr.io/tokawa-ptpqa:latest')
param containerImage string

@description('Azure Container Registry login server, e.g. myacr.azurecr.io')
param acrLoginServer string

@description('Azure Container Registry admin username')
@secure()
param acrUsername string

@description('Azure Container Registry admin password')
@secure()
param acrPassword string

// Bicep has no native float type; a string is converted to a JSON number via
// json() below, which is the idiomatic pattern for fractional vCPU values in
// Azure Container Apps (e.g. '0.25', '0.5', '1.0').
@description('Number of vCPU cores allocated to the container as a decimal string (e.g. "0.5")')
@allowed(['0.25', '0.5', '0.75', '1.0', '1.25', '1.5', '1.75', '2.0'])
param cpuCores string = '0.5'

@description('Memory allocated to the container (e.g. 1.0Gi)')
param memorySize string = '1.0Gi'

@description('Minimum number of replicas (0 allows scale-to-zero)')
param minReplicas int = 0

@description('Maximum number of replicas')
param maxReplicas int = 3

// ── Log Analytics Workspace ──────────────────────────────────────────────────
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: '${appName}-law'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// ── Container Apps Environment ───────────────────────────────────────────────
resource containerAppsEnv 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: '${appName}-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// ── Container App ─────────────────────────────────────────────────────────────
resource containerApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: appName
  location: location
  properties: {
    managedEnvironmentId: containerAppsEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 6413
        transport: 'http'
      }
      registries: [
        {
          server: acrLoginServer
          username: acrUsername
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        {
          name: 'acr-password'
          value: acrPassword
        }
      ]
    }
    template: {
      containers: [
        {
          name: appName
          image: containerImage
          resources: {
            cpu: json(cpuCores)
            memory: memorySize
          }
          env: [
            {
              name: 'PORT'
              value: '6413'
            }
          ]
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
      }
    }
  }
}

// ── Outputs ───────────────────────────────────────────────────────────────────
@description('Public URL of the deployed Container App')
output appUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}'

@description('Container Apps Environment resource ID')
output environmentId string = containerAppsEnv.id
