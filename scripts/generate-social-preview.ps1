Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$iconPath = Join-Path $projectRoot 'public\icons\icon-512.png'
$outputPath = Join-Path $projectRoot 'public\social-preview.png'
$bitmap = [System.Drawing.Bitmap]::new(1200, 630)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

$navy = [System.Drawing.ColorTranslator]::FromHtml('#14283c')
$navyLight = [System.Drawing.ColorTranslator]::FromHtml('#244258')
$gold = [System.Drawing.ColorTranslator]::FromHtml('#cba97d')
$white = [System.Drawing.ColorTranslator]::FromHtml('#ffffff')
$muted = [System.Drawing.ColorTranslator]::FromHtml('#d4dde2')
$background = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
  [System.Drawing.Rectangle]::new(0, 0, 1200, 630), $navy, $navyLight, 0)
$graphics.FillRectangle($background, 0, 0, 1200, 630)

$line = [System.Drawing.Pen]::new($gold, 3)
$line.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$line.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$graphics.DrawLine($line, 78, 59, 1122, 59)
$graphics.DrawLine($line, 78, 568, 1122, 568)

$ring = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(35, 203, 169, 125), 2)
$graphics.DrawEllipse($ring, 760, 88, 450, 450)
$graphics.DrawEllipse($ring, 830, 158, 310, 310)

$icon = [System.Drawing.Image]::FromFile($iconPath)
$graphics.DrawImage($icon, 76, 95, 155, 155)

$packageFill = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(25, 203, 169, 125))
$packageEdge = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(180, 203, 169, 125), 3)
$graphics.FillRectangle($packageFill, 890, 276, 195, 210)
$graphics.DrawRectangle($packageEdge, 890, 276, 195, 210)
$graphics.DrawLine($packageEdge, 890, 332, 1085, 332)
$graphics.DrawLine($packageEdge, 957, 276, 957, 332)
$graphics.DrawLine($packageEdge, 1020, 276, 1020, 332)
$graphics.DrawLine($packageEdge, 920, 445, 971, 445)
$graphics.FillRectangle($packageFill, 780, 341, 140, 145)
$graphics.DrawRectangle($packageEdge, 780, 341, 140, 145)
$graphics.DrawLine($packageEdge, 780, 380, 920, 380)
$graphics.DrawLine($packageEdge, 840, 341, 840, 380)

$goldBrush = [System.Drawing.SolidBrush]::new($gold)
$whiteBrush = [System.Drawing.SolidBrush]::new($white)
$mutedBrush = [System.Drawing.SolidBrush]::new($muted)
$eyebrowFont = [System.Drawing.Font]::new('Segoe UI', 22, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$titleFont = [System.Drawing.Font]::new('Segoe UI', 62, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$subtitleFont = [System.Drawing.Font]::new('Segoe UI', 24, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$graphics.DrawString('CATALOGUE DE PRODUITS', $eyebrowFont, $goldBrush, 77, 277)
$graphics.DrawString(('La s' + [char]0xE9 + 'lection KS'), $titleFont, $whiteBrush, 72, 322)
$graphics.DrawString(('Explorez nos produits, leurs prix et disponibilit' + [char]0xE9 + 's.'), $subtitleFont, $mutedBrush, 78, 427)

$bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
$subtitleFont.Dispose()
$titleFont.Dispose()
$eyebrowFont.Dispose()
$mutedBrush.Dispose()
$whiteBrush.Dispose()
$goldBrush.Dispose()
$packageEdge.Dispose()
$packageFill.Dispose()
$icon.Dispose()
$ring.Dispose()
$line.Dispose()
$background.Dispose()
$graphics.Dispose()
$bitmap.Dispose()
