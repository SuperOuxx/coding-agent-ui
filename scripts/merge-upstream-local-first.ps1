param(
  [string]$UpstreamRemote = "upstream",
  [string]$UpstreamBranch = "main",
  [string]$MainBranch = "main",
  [string]$MergeBranch = "",
  [switch]$SkipFetch,
  [switch]$NoBuildCheck
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Section {
  param([string]$Message)
  Write-Host ""
  Write-Host ("=" * 78)
  Write-Host $Message
  Write-Host ("=" * 78)
}

function Invoke-Git {
  param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Args
  )
  & git @Args
  return $LASTEXITCODE
}

function Ensure-GitRepo {
  Invoke-Git rev-parse --is-inside-work-tree | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Current directory is not a git repository."
  }
}

function Ensure-CleanWorkingTree {
  $dirty = (& git status --porcelain)
  if ($dirty) {
    throw "Working tree is not clean. Commit/stash changes first."
  }
}

function Confirm-Step {
  param(
    [string]$Prompt,
    [bool]$DefaultYes = $true
  )

  $hint = if ($DefaultYes) { "[Y/n]" } else { "[y/N]" }
  while ($true) {
    $raw = Read-Host "$Prompt $hint"
    $value = $raw.Trim().ToLowerInvariant()

    if ([string]::IsNullOrWhiteSpace($value)) {
      return $DefaultYes
    }
    if ($value -in @("y", "yes")) {
      return $true
    }
    if ($value -in @("n", "no")) {
      return $false
    }
    Write-Host "Please input y or n."
  }
}

function Test-MergeInProgress {
  $gitDir = (& git rev-parse --git-dir).Trim()
  if ([string]::IsNullOrWhiteSpace($gitDir)) {
    return $false
  }
  return Test-Path (Join-Path $gitDir "MERGE_HEAD")
}

function Get-MergePreviewConflicts {
  param(
    [string]$MainRef,
    [string]$UpstreamRef
  )

  $mergeBase = (& git merge-base $MainRef $UpstreamRef).Trim()
  if ([string]::IsNullOrWhiteSpace($mergeBase)) {
    throw "Failed to determine merge-base for $MainRef and $UpstreamRef."
  }

  $tmpFile = Join-Path $env:TEMP ("merge_tree_preview_" + [guid]::NewGuid().ToString() + ".txt")
  & git merge-tree $mergeBase $MainRef $UpstreamRef | Set-Content -Encoding UTF8 $tmpFile
  $lines = @(Get-Content $tmpFile)

  $items = @()
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "^(changed in both|added in both|removed in both)$") {
      $type = $matches[1]
      $path = $null
      for ($j = $i + 1; $j -lt [Math]::Min($i + 8, $lines.Count); $j++) {
        if ($lines[$j] -match "^  our\s+\d+\s+[0-9a-f]+\s+(.+)$") {
          $path = $matches[1]
          break
        }
        if ($lines[$j] -match "^  result\s+\d+\s+[0-9a-f]+\s+(.+)$") {
          $path = $matches[1]
          break
        }
      }
      if ($null -ne $path) {
        $items += [PSCustomObject]@{
          Type = $type
          Path = $path
        }
      }
    }
  }

  return $items
}

function Show-Hotspots {
  param([object[]]$ConflictItems)

  if (-not $ConflictItems -or $ConflictItems.Count -eq 0) {
    Write-Host "No conflict-style entries from merge-tree preview."
    return
  }

  $grouped = $ConflictItems |
    ForEach-Object {
      $parts = $_.Path -split "/"
      if ($parts.Count -ge 2) {
        "$($parts[0])/$($parts[1])"
      } else {
        $parts[0]
      }
    } |
    Group-Object |
    Sort-Object Count -Descending

  Write-Host "Top conflict hotspots:"
  $grouped | Select-Object -First 12 | ForEach-Object {
    Write-Host ("- {0}: {1}" -f $_.Name, $_.Count)
  }
}

function Resolve-AllConflictsAsOurs {
  $conflicts = @(& git diff --name-only --diff-filter=U)
  foreach ($file in $conflicts) {
    Invoke-Git checkout --ours -- $file | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to checkout ours for $file" }
    Invoke-Git add -- $file | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to stage $file" }
  }
}

function Select-ConflictAction {
  param([string]$FilePath)
  Write-Host ""
  Write-Host ("Conflict file: {0}" -f $FilePath)
  Write-Host "[o] keep ours (default)"
  Write-Host "[t] keep theirs"
  Write-Host "[d] show conflict diff"
  Write-Host "[m] open mergetool"
  Write-Host "[e] manual edit (stage yourself)"
  Write-Host "[a] abort merge now"
  while ($true) {
    $choice = (Read-Host "Choose o/t/d/m/e/a").Trim().ToLowerInvariant()
    if ([string]::IsNullOrWhiteSpace($choice)) {
      return "o"
    }
    if ($choice -in @("o", "t", "d", "m", "e", "a")) {
      return $choice
    }
    Write-Host "Invalid choice."
  }
}

function Resolve-ConflictsInteractive {
  while ($true) {
    $conflicts = @(& git diff --name-only --diff-filter=U)
    if ($conflicts.Count -eq 0) {
      break
    }

    foreach ($file in $conflicts) {
      $resolved = $false
      while (-not $resolved) {
        $action = Select-ConflictAction -FilePath $file
        switch ($action) {
          "o" {
            Invoke-Git checkout --ours -- $file | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "Failed to checkout ours for $file" }
            Invoke-Git add -- $file | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "Failed to stage $file" }
            $resolved = $true
          }
          "t" {
            Invoke-Git checkout --theirs -- $file | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "Failed to checkout theirs for $file" }
            Invoke-Git add -- $file | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "Failed to stage $file" }
            $resolved = $true
          }
          "d" {
            & git diff -- $file
          }
          "m" {
            Invoke-Git mergetool -- $file | Out-Null
            $stillConflict = (& git diff --name-only --diff-filter=U -- $file)
            if (-not $stillConflict) {
              Invoke-Git add -- $file | Out-Null
              if ($LASTEXITCODE -ne 0) { throw "Failed to stage $file after mergetool" }
              $resolved = $true
            }
          }
          "e" {
            Read-Host "Edit and stage manually, then press Enter to re-check" | Out-Null
            $stillConflict = (& git diff --name-only --diff-filter=U -- $file)
            if (-not $stillConflict) {
              $resolved = $true
            }
          }
          "a" {
            if (Test-MergeInProgress) {
              Invoke-Git merge --abort | Out-Null
            }
            throw "Merge aborted by user."
          }
        }
      }
    }
  }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
Set-Location $repoRoot

$upstreamRef = "{0}/{1}" -f $UpstreamRemote, $UpstreamBranch

try {
  Write-Section "Step 1: Pre-flight"
  Ensure-GitRepo
  Ensure-CleanWorkingTree

  if (-not $SkipFetch) {
    Write-Host "Fetching remotes..."
    Invoke-Git fetch origin --prune | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to fetch origin." }
    Invoke-Git fetch $UpstreamRemote --prune | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to fetch $UpstreamRemote." }
  } else {
    Write-Host "SkipFetch enabled."
  }

  $aheadUpstream = (& git rev-list --count "$MainBranch..$upstreamRef").Trim()
  $aheadLocal = (& git rev-list --count "$upstreamRef..$MainBranch").Trim()
  Write-Host ("Divergence: upstream-only={0}, local-only={1}" -f $aheadUpstream, $aheadLocal)

  $statLine = (& git diff --stat --find-renames $MainBranch $upstreamRef | Select-Object -Last 1)
  if ($statLine) {
    Write-Host ("Diff stat: {0}" -f $statLine.Trim())
  }

  Write-Section "Step 2: Dry-run preview (no repo changes)"
  $previewItems = @(Get-MergePreviewConflicts -MainRef $MainBranch -UpstreamRef $upstreamRef)
  $changedInBoth = @($previewItems | Where-Object { $_.Type -eq "changed in both" }).Count
  $addedInBoth = @($previewItems | Where-Object { $_.Type -eq "added in both" }).Count
  $removedInBoth = @($previewItems | Where-Object { $_.Type -eq "removed in both" }).Count
  Write-Host ("Preview conflict-style entries: changed={0}, added={1}, removed={2}, total={3}" -f $changedInBoth, $addedInBoth, $removedInBoth, @($previewItems).Count)
  Show-Hotspots -ConflictItems $previewItems

  if (-not (Confirm-Step -Prompt "Continue to local-first merge stage?" -DefaultYes $true)) {
    Write-Host "Stopped after preview."
    exit 0
  }

  Write-Section "Step 3: Prepare merge branch"
  Invoke-Git switch $MainBranch | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to switch to $MainBranch." }
  Invoke-Git pull --ff-only origin $MainBranch | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to fast-forward $MainBranch from origin." }

  if ([string]::IsNullOrWhiteSpace($MergeBranch)) {
    $MergeBranch = "merge/upstream-local-first-{0}" -f (Get-Date -Format "yyyyMMdd-HHmmss")
  }

  Invoke-Git show-ref --verify --quiet ("refs/heads/{0}" -f $MergeBranch) | Out-Null
  if ($LASTEXITCODE -eq 0) {
    if (Confirm-Step -Prompt "Branch '$MergeBranch' exists. Delete and recreate?" -DefaultYes $false) {
      Invoke-Git branch -D $MergeBranch | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "Failed to delete existing branch $MergeBranch." }
    } else {
      $MergeBranch = "{0}-{1}" -f $MergeBranch, (Get-Date -Format "HHmmss")
      Write-Host ("Using branch: {0}" -f $MergeBranch)
    }
  }

  Invoke-Git switch -c $MergeBranch | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to create merge branch $MergeBranch." }
  Write-Host ("Current branch: {0}" -f $MergeBranch)

  Write-Section "Step 4: Merge --no-commit --no-ff -X ours"
  Invoke-Git merge --no-commit --no-ff -X ours $upstreamRef | Out-Null
  if ($LASTEXITCODE -ne 0) {
    $conflicts = @(& git diff --name-only --diff-filter=U)
    if ($conflicts.Count -eq 0) {
      throw "Merge failed without unresolved conflict files. Inspect git output manually."
    }

    Write-Host ("Unresolved conflicts after -X ours: {0}" -f $conflicts.Count)
    if (Confirm-Step -Prompt "Auto-resolve all remaining conflicts as ours first?" -DefaultYes $true) {
      Resolve-AllConflictsAsOurs
    }

    $remainingAfterAuto = @(& git diff --name-only --diff-filter=U)
    if ($remainingAfterAuto.Count -gt 0) {
      Write-Host "Some conflicts remain. Entering interactive resolver."
      Resolve-ConflictsInteractive
    }
  }

  $remaining = @(& git diff --name-only --diff-filter=U)
  if ($remaining.Count -gt 0) {
    throw "There are still unresolved conflicts. Resolve and commit manually."
  }

  Write-Host ""
  Write-Host "Local-first merge changes are staged but not committed."
  & git status --short --branch

  if (-not (Confirm-Step -Prompt "Create merge commit now?" -DefaultYes $true)) {
    Write-Host "Stopped before commit. Review with 'git diff --cached' and commit manually."
    exit 0
  }

  $defaultMessage = "merge: local-first sync $upstreamRef into $MainBranch"
  $message = Read-Host "Commit message [$defaultMessage]"
  if ([string]::IsNullOrWhiteSpace($message)) {
    $message = $defaultMessage
  }

  Invoke-Git commit -m $message | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to create merge commit." }
  Write-Host "Merge commit created successfully."

  if (-not $NoBuildCheck) {
    if (Confirm-Step -Prompt "Run npm.cmd run build now?" -DefaultYes $true) {
      & npm.cmd run build
      if ($LASTEXITCODE -ne 0) {
        throw "Build failed after merge commit."
      }
      Write-Host "Build passed."
    }
  }

  Write-Section "Done"
  Write-Host ("Branch ready: {0}" -f $MergeBranch)
  Write-Host ("If all good, push with: git push origin {0}" -f $MergeBranch)
}
catch {
  Write-Host ""
  Write-Host ("ERROR: {0}" -f $_.Exception.Message) -ForegroundColor Red
  if (Test-MergeInProgress) {
    if (Confirm-Step -Prompt "A merge is in progress. Abort it now?" -DefaultYes $true) {
      Invoke-Git merge --abort | Out-Null
      Write-Host "Merge aborted."
    } else {
      Write-Host "Merge state kept for manual recovery."
    }
  }
  exit 1
}
