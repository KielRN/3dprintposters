# Project Cloudflare Reference

## Local Environment Names

Expected local variables, usually in root `.env`:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ZONE_NAME`
- `CLOUDFLARE_ZONE_ID`
- `MESHY_WEBHOOK_URL`
- `MESHY_WEBHOOK_SECRET`

Do not print values. It is acceptable to report that a value is present, missing, has a non-secret length, or starts with an expected prefix such as `cfat_`.

## Known Ids

- Account: `778c1ab69c11e349c591073496bcb4a9`
- `3dprintyou.com`: `2ee750c1c76f7e569184cbeacaa6787d`
- `3dprintposters.com`: `b4f2622ab29b7ea445ecca0ba554ff63`

These ids are identifiers, not credentials. Still avoid spreading them outside project docs unless useful.

## Safe PowerShell Pattern

Use this pattern to read local env vars without printing secrets:

```powershell
$ErrorActionPreference = 'Stop'
$vars = @{}
Get-Content -Path '.env' | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
  $parts = $_ -split '=', 2
  $vars[$parts[0].Trim()] = $parts[1].Trim().Trim('"').Trim("'")
}

$token = $vars['CLOUDFLARE_API_TOKEN']
$accountId = $vars['CLOUDFLARE_ACCOUNT_ID']
if (-not $accountId) { $accountId = '778c1ab69c11e349c591073496bcb4a9' }
if (-not $token) { throw 'CLOUDFLARE_API_TOKEN missing' }

$headers = @{ Authorization = "Bearer $token" }
```

## Verify Account-Scoped Token

Account-scoped `cfat_` tokens verify at the account endpoint:

```powershell
$response = Invoke-RestMethod `
  -Method GET `
  -Uri "https://api.cloudflare.com/client/v4/accounts/$accountId/tokens/verify" `
  -Headers $headers

[pscustomobject]@{
  success = $response.success
  status = $response.result.status
  idPresent = ($null -ne $response.result.id)
} | ConvertTo-Json
```

Do not use `/user/tokens/verify` as the primary check for this project token.

## List Project Zones

```powershell
$response = Invoke-RestMethod `
  -Method GET `
  -Uri "https://api.cloudflare.com/client/v4/zones?account.id=$accountId&per_page=50" `
  -Headers $headers

$response.result |
  Where-Object { $_.name -in @('3dprintyou.com', '3dprintposters.com') } |
  Select-Object name,id,status |
  ConvertTo-Json
```

## Inspect 3DPrintYou DNS

```powershell
$zoneId = '2ee750c1c76f7e569184cbeacaa6787d'
$response = Invoke-RestMethod `
  -Method GET `
  -Uri "https://api.cloudflare.com/client/v4/zones/$zoneId/dns_records?per_page=100" `
  -Headers $headers

$response.result |
  Where-Object { $_.name -like '*3dprintyou.com' } |
  Select-Object type,name,content,proxied,id |
  ConvertTo-Json -Depth 5
```

If this returns an auth error even token verification succeeds, re-check token permissions for zone DNS reads and whether the account token is allowed to call zone-scoped REST endpoints.

## Inspect Worker Surface

```powershell
$scripts = Invoke-RestMethod `
  -Method GET `
  -Uri "https://api.cloudflare.com/client/v4/accounts/$accountId/workers/scripts" `
  -Headers $headers

$routes = Invoke-RestMethod `
  -Method GET `
  -Uri "https://api.cloudflare.com/client/v4/zones/$zoneId/workers/routes" `
  -Headers $headers
```

Report script ids, route patterns, and associated scripts only. Do not report Worker secret values.

## Meshy Webhook Receiver Target

Preferred endpoint:

```text
https://api.3dprintyou.com/webhooks/meshy
```

Recommended shape:

- `GET /health` returns a simple non-secret health response.
- `POST /webhooks/meshy` verifies the configured webhook secret/signature shape when available.
- Valid webhook calls should enqueue or forward task status updates to the backend. Do not make the Worker the source of truth for customer jobs unless it has durable storage and idempotency.
- Meshy dashboard setup remains a human step unless Meshy publishes a supported API for webhook creation.
