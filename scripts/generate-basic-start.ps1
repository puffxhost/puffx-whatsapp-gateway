Add-Type -AssemblyName System.Drawing

$width = 960
$height = 540
$output = Join-Path $PSScriptRoot '..\basic_start.gif'
$frames = [System.Collections.Generic.List[System.Drawing.Bitmap]]::new()
$frameDir = Join-Path $PSScriptRoot '..\.basic-start-frames'
$steps = @(
  @{ title = 'Your WhatsApp gateway, step by step'; subtitle = 'Self-host it, link a device, then send your first text through the REST API.'; kind = 'overview' },
  @{ title = '1. Set your private environment'; subtitle = 'Copy the example config and create two different strong secrets.'; kind = 'env' },
  @{ title = '2. Start the gateway'; subtitle = 'Docker starts PostgreSQL and the API, then keeps their data in volumes.'; kind = 'docker' },
  @{ title = '3. Create a session and pair WhatsApp'; subtitle = 'Sign up in the dashboard, add a session, then scan its live QR.'; kind = 'pair' },
  @{ title = '4. Save your API key and session ID'; subtitle = 'The API key is shown once. Keep both values on your server.'; kind = 'key' },
  @{ title = '5. Send a text message'; subtitle = 'Call the endpoint from your backend with the session and recipient.'; kind = 'send' },
  @{ title = 'Going public? Put HTTPS in front'; subtitle = 'Use a domain and reverse proxy; keep the database and auth volume private.'; kind = 'https' }
)

function New-Brush([string]$hex) {
  return [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($hex))
}
function Draw-Text($g, [string]$value, [float]$x, [float]$y, [float]$size, [string]$color = '#F1F1F6', [string]$family = 'Segoe UI', [bool]$bold = $false) {
  $style = if ($bold) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }
  $font = [System.Drawing.Font]::new($family, $size, $style, [System.Drawing.GraphicsUnit]::Pixel)
  $brush = New-Brush $color
  $g.DrawString($value, $font, $brush, $x, $y)
  $font.Dispose(); $brush.Dispose()
}
function Fill-Card($g, [float]$x, [float]$y, [float]$w, [float]$h, [string]$color = '#191D2A', [string]$border = '#303647') {
  $fill = New-Brush $color
  $pen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml($border), 1)
  $g.FillRectangle($fill, $x, $y, $w, $h)
  $g.DrawRectangle($pen, $x, $y, $w, $h)
  $fill.Dispose(); $pen.Dispose()
}
function Fill-Pill($g, [float]$x, [float]$y, [float]$w, [float]$h, [string]$color) {
  $brush = New-Brush $color
  $g.FillEllipse($brush, $x, $y, $h, $h)
  $g.FillEllipse($brush, $x + $w - $h, $y, $h, $h)
  $g.FillRectangle($brush, $x + $h / 2, $y, $w - $h, $h)
  $brush.Dispose()
}
function Draw-Base($g, [int]$index, [int]$pulse) {
  $g.Clear([System.Drawing.ColorTranslator]::FromHtml('#10131C'))
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $bgGlow = New-Brush '#171B28'
  $g.FillEllipse($bgGlow, 670, -150, 500, 390)
  $bgGlow.Dispose()
  Fill-Card $g 0 0 $width 58 '#151925' '#252B3A'
  Fill-Card $g 22 15 29 29 '#B8F36B' '#B8F36B'
  Draw-Text $g 'P' 31 17 19 '#17200D' 'Segoe UI' $true
  Draw-Text $g 'PUFFX' 61 16 16 '#F1F1F6' 'Segoe UI' $true
  Draw-Text $g 'WHATSAPP GATEWAY' 122 20 10 '#9BA3B9' 'Consolas'
  Draw-Text $g 'SELF-HOSTED  ·  QUICK START' 736 21 10 '#9BA3B9' 'Consolas'
  Draw-Text $g ("STEP {0} / 7" -f ($index + 1)) 32 82 11 '#B8F36B' 'Consolas' $true
  Draw-Text $g $steps[$index].title 32 108 28 '#F1F1F6' 'Segoe UI' $true
  Draw-Text $g $steps[$index].subtitle 33 148 14 '#A3A9BA'
  Fill-Card $g 32 192 896 278 '#191D2A' '#2B3041'
  for ($i = 0; $i -lt 7; $i++) {
    $x = 40 + $i * 130
    $c = if ($i -le $index) { '#B8F36B' } else { '#373D4D' }
    if ($i -eq $index -and $pulse -eq 1) { $c = '#D4FF9A' }
    Fill-Pill $g $x 502 112 5 $c
  }
  Draw-Text $g 'PUFFX  /  BASIC START' 33 514 9 '#778095' 'Consolas'
  Draw-Text $g 'Docker  ·  Dashboard  ·  WhatsApp  ·  REST API' 603 514 9 '#778095' 'Consolas'
}
function Draw-Content($g, [string]$kind, [int]$pulse) {
  switch ($kind) {
    'overview' {
      Draw-Text $g 'One small setup. One clear path to your first message.' 58 218 17 '#DDE1EA' 'Segoe UI' $true
      $labels = @(@('01','Configure','Secrets stay on your host.'), @('02','Run','Docker starts API + database.'), @('03','Pair','Link your own WhatsApp account.'), @('04','Send','Use a private REST API key.'))
      for ($i = 0; $i -lt 4; $i++) {
        $x = 58 + $i * 210
        $glow = if ($i -eq $pulse) { '#273821' } else { '#202535' }
        Fill-Card $g $x 275 184 138 $glow '#394154'
        Draw-Text $g $labels[$i][0] ($x + 16) 290 11 '#B8F36B' 'Consolas' $true
        Draw-Text $g $labels[$i][1] ($x + 16) 318 18 '#F1F1F6' 'Segoe UI' $true
        Draw-Text $g $labels[$i][2] ($x + 16) 352 11 '#A3A9BA'
      }
      Draw-Text $g 'You host it yourself — the public GitHub repository is not a hosted service.' 58 430 12 '#A3A9BA'
    }
    'env' {
      Draw-Text $g 'From the repository folder:' 60 220 12 '#9BA3B9'
      Fill-Card $g 58 245 510 72 '#111620' '#343B4D'
      Draw-Text $g 'cp .env.example .env' 80 266 19 '#D4FF9A' 'Consolas' $true
      Draw-Text $g 'PowerShell:  Copy-Item .env.example .env' 80 297 11 '#9BA3B9' 'Consolas'
      Fill-Card $g 593 220 300 205 '#202535' '#394154'
      Draw-Text $g 'Replace these values' 615 242 14 '#F1F1F6' 'Segoe UI' $true
      Draw-Text $g 'POSTGRES_PASSWORD' 615 281 12 '#B8F36B' 'Consolas'
      Draw-Text $g 'SESSION_SECRET' 615 316 12 '#B8F36B' 'Consolas'
      Draw-Text $g 'API_KEY_PEPPER' 615 351 12 '#B8F36B' 'Consolas'
      Draw-Text $g 'Use different random secrets. Never commit .env.' 615 389 10 '#A3A9BA'
      Fill-Pill $g 58 356 450 5 $(if ($pulse -eq 1) { '#D4FF9A' } else { '#B8F36B' })
      Draw-Text $g 'Example: openssl rand -hex 32' 58 378 12 '#A3A9BA' 'Consolas'
    }
    'docker' {
      Draw-Text $g 'Start both services and build the web dashboard:' 60 220 12 '#9BA3B9'
      Fill-Card $g 58 248 600 94 '#111620' '#343B4D'
      Draw-Text $g 'docker compose up -d --build' 82 278 17 '#D4FF9A' 'Consolas' $true
      Draw-Text $g 'API + PostgreSQL  ·  persistent database + WhatsApp volumes' 82 312 11 '#9BA3B9' 'Consolas'
      Fill-Card $g 685 248 207 94 '#17251B' '#4D6F38'
      Fill-Pill $g 707 274 9 9 $(if ($pulse -eq 2) { '#D4FF9A' } else { '#B8F36B' })
      Draw-Text $g 'READY' 729 269 12 '#D4FF9A' 'Consolas' $true
      Draw-Text $g 'open :3000' 707 303 12 '#D8DDC9' 'Consolas'
      Draw-Text $g 'Check: /api/v1/ready → ready' 60 379 13 '#DDE1EA' 'Consolas'
      Draw-Text $g 'Dashboard: http://127.0.0.1:3000' 60 412 13 '#A3A9BA' 'Consolas'
    }
    'pair' {
      Fill-Card $g 58 220 372 204 '#202535' '#394154'
      Draw-Text $g 'YOUR PUFFX DASHBOARD' 78 239 10 '#9BA3B9' 'Consolas'
      Draw-Text $g 'Create account  →  Add session' 78 273 15 '#F1F1F6' 'Segoe UI' $true
      Draw-Text $g 'Choose QR pair and scan the live QR' 78 312 12 '#A3A9BA'
      Draw-Text $g 'shown here with your phone.' 78 333 12 '#A3A9BA'
      Fill-Card $g 78 370 135 31 '#B8F36B' '#B8F36B'
      Draw-Text $g 'QR PAIR' 111 377 12 '#17200D' 'Consolas' $true
      Fill-Card $g 457 220 435 204 '#202535' '#394154'
      Draw-Text $g 'ON YOUR PHONE' 480 239 10 '#9BA3B9' 'Consolas'
      Fill-Card $g 480 267 387 45 '#191D2A' '#303647'
      Draw-Text $g 'WhatsApp  →  Settings' 498 279 14 '#F1F1F6'
      Fill-Card $g 480 321 387 45 '#191D2A' '#303647'
      Draw-Text $g 'Linked devices  →  Link a device' 498 333 14 '#F1F1F6'
      Draw-Text $g 'Pairing code is available if QR is inconvenient.' 480 390 11 '#B8F36B'
    }
    'key' {
      Draw-Text $g 'After the session says CONNECTED:' 60 224 12 '#9BA3B9'
      Fill-Card $g 58 252 493 125 '#111620' '#343B4D'
      Draw-Text $g 'SESSION ID' 82 267 10 '#9BA3B9' 'Consolas'
      Draw-Text $g 'copy the full UUID from the session card' 82 287 12 '#DDE1EA' 'Consolas'
      Draw-Text $g 'API KEY  (shown once)' 82 322 10 '#9BA3B9' 'Consolas'
      Draw-Text $g 'pfx_••••••••••••••••••••••••' 82 342 17 '#D4FF9A' 'Consolas' $true
      Fill-Card $g 585 252 305 125 '#202535' '#394154'
      Draw-Text $g 'Store it safely' 608 271 15 '#F1F1F6' 'Segoe UI' $true
      Draw-Text $g 'Keep key + session ID in your' 608 309 12 '#A3A9BA'
      Draw-Text $g 'backend env or secret manager.' 608 330 12 '#A3A9BA'
      Draw-Text $g 'Never expose API keys in a browser.' 60 414 12 '#B8F36B'
    }
    'send' {
      Draw-Text $g 'Run this from a trusted backend or terminal:' 60 220 12 '#9BA3B9'
      Fill-Card $g 58 248 835 146 '#111620' '#343B4D'
      Draw-Text $g 'curl -X POST $PUFFX_BASE_URL/api/v1/messages/send' 80 267 13 '#D4FF9A' 'Consolas'
      Draw-Text $g '  Authorization: Bearer $PUFFX_API_KEY' 80 293 13 '#DDE1EA' 'Consolas'
      Draw-Text $g '  Content-Type: application/json' 80 319 13 '#DDE1EA' 'Consolas'
      Draw-Text $g '  -d {"sessionId":"…","to":"919876543210","type":"text","message":"Hello!"}' 80 345 12 '#DDE1EA' 'Consolas'
      Fill-Card $g 58 410 154 34 '#17251B' '#4D6F38'
      Draw-Text $g 'HTTP 202  ACCEPTED' 72 418 11 '#D4FF9A' 'Consolas' $true
      Draw-Text $g 'Accepted by WhatsApp provider ≠ confirmed delivery.' 233 419 12 '#A3A9BA'
    }
    'https' {
      Fill-Card $g 58 224 380 177 '#202535' '#394154'
      Draw-Text $g 'YOUR VPS' 82 244 10 '#9BA3B9' 'Consolas'
      Draw-Text $g 'Internet → HTTPS / Nginx' 82 280 17 '#F1F1F6' 'Segoe UI' $true
      Draw-Text $g 'TLS certificate on your domain' 82 316 12 '#A3A9BA'
      Draw-Text $g 'Proxy to 127.0.0.1:3000' 82 341 12 '#B8F36B' 'Consolas'
      Draw-Text $g 'DATABASE + AUTH VOLUME PRIVATE' 82 376 10 '#D4FF9A' 'Consolas' $true
      Fill-Card $g 467 224 424 177 '#17251B' '#4D6F38'
      Draw-Text $g 'Set in .env for HTTPS' 491 244 14 '#F1F1F6' 'Segoe UI' $true
      Draw-Text $g 'PUBLIC_BASE_URL=https://gateway.example.com' 491 282 12 '#D4FF9A' 'Consolas'
      Draw-Text $g 'COOKIE_SECURE=true' 491 314 12 '#D4FF9A' 'Consolas'
      Draw-Text $g 'Back up PostgreSQL + WhatsApp auth data.' 491 365 11 '#A3A9BA'
      Draw-Text $g 'Read the VPS and security guides before inviting users.' 58 428 12 '#A3A9BA'
    }
  }
}

for ($i = 0; $i -lt $steps.Count; $i++) {
  for ($pulse = 0; $pulse -lt 3; $pulse++) {
    $bitmap = [System.Drawing.Bitmap]::new($width, $height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    Draw-Base $graphics $i $pulse
    Draw-Content $graphics $steps[$i].kind $pulse
    $graphics.Dispose()
    $frames.Add($bitmap)
  }
}

if (Test-Path $frameDir) { Remove-Item -LiteralPath $frameDir -Recurse -Force }
New-Item -ItemType Directory -Path $frameDir | Out-Null
for ($i = 0; $i -lt $frames.Count; $i++) {
  $frames[$i].Save((Join-Path $frameDir ("frame-{0:D2}.bmp" -f $i)), [System.Drawing.Imaging.ImageFormat]::Bmp)
  $frames[$i].Dispose()
}
$encoderScript = Join-Path $PSScriptRoot 'encode-gif.py'
python $encoderScript $frameDir $output
if ($LASTEXITCODE -ne 0) { throw 'GIF encoding failed.' }
Remove-Item -LiteralPath $frameDir -Recurse -Force
Write-Output "Created $output"
