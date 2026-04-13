using './main.bicep'

// ── Required parameters ───────────────────────────────────────────────────────
// Replace the placeholder values before running 'az deployment group create'

param acrLoginServer = 'YOUR_ACR_NAME.azurecr.io'
param containerImage = 'YOUR_ACR_NAME.azurecr.io/ntpsync:latest'

// acrUsername and acrPassword are sensitive; pass them via --parameters on the
// CLI (see deploy.sh) or through a Key Vault reference.
param acrUsername = ''
param acrPassword = ''

// ── Optional overrides ────────────────────────────────────────────────────────
param location = 'japaneast'
param appName = 'ntpsync'
param cpuCores = '0.5'
param memorySize = '1.0Gi'
param minReplicas = 0
param maxReplicas = 3
