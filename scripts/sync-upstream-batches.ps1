param(
  [ValidateSet("1", "2", "3", "4", "all")]
  [string]$Batch = "all",
  [string]$UpstreamRemote = "upstream",
  [string]$UpstreamBranch = "main",
  [string]$MainBranch = "main",
  [switch]$SkipFetch,
  [switch]$SkipChecks
)

$ErrorActionPreference = "Stop"

function Write-Section {
  param([string]$Message)
  Write-Host ""
  Write-Host ("=" * 72)
  Write-Host $Message
  Write-Host ("=" * 72)
}

function Invoke-Git {
  param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Args
  )
  & git @Args
  return $LASTEXITCODE
}

function Ensure-CleanWorkingTree {
  $dirty = (& git status --porcelain)
  if ($dirty) {
    throw "Working tree is not clean. Please commit/stash changes before running this script."
  }
}

function Ensure-BranchExists {
  param([string]$BranchName)
  $exists = (& git show-ref --verify --quiet ("refs/heads/{0}" -f $BranchName))
  if ($LASTEXITCODE -ne 0) {
    throw "Required local branch '$BranchName' does not exist."
  }
}

function Select-ConflictAction {
  param([string]$FilePath)
  Write-Host ""
  Write-Host ("Conflict file: {0}" -f $FilePath)
  Write-Host "[o] keep local (ours)"
  Write-Host "[t] keep upstream commit (theirs)"
  Write-Host "[m] open git mergetool"
  Write-Host "[d] show conflict diff"
  Write-Host "[e] manual edit (then stage yourself)"
  Write-Host "[a] abort current cherry-pick"
  while ($true) {
    $choice = (Read-Host "Choose o/t/m/d/e/a").Trim().ToLowerInvariant()
    if ($choice -in @("o", "t", "m", "d", "e", "a")) {
      return $choice
    }
    Write-Host "Invalid choice."
  }
}

function Resolve-ConflictsInteractive {
  while ($true) {
    $conflicts = (& git diff --name-only --diff-filter=U)
    if (-not $conflicts) {
      break
    }

    foreach ($file in $conflicts) {
      $done = $false
      while (-not $done) {
        $action = Select-ConflictAction -FilePath $file
        switch ($action) {
          "o" {
            Invoke-Git checkout --ours -- $file | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "Failed to checkout ours for $file" }
            Invoke-Git add -- $file | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "Failed to stage $file" }
            $done = $true
          }
          "t" {
            Invoke-Git checkout --theirs -- $file | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "Failed to checkout theirs for $file" }
            Invoke-Git add -- $file | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "Failed to stage $file" }
            $done = $true
          }
          "m" {
            Invoke-Git mergetool -- $file | Out-Null
            if ($LASTEXITCODE -ne 0) {
              Write-Host "Mergetool exited non-zero. Resolve manually if needed."
            }
            $stillConflict = (& git diff --name-only --diff-filter=U -- $file)
            if (-not $stillConflict) {
              Invoke-Git add -- $file | Out-Null
              $done = $true
            }
          }
          "d" {
            & git diff -- $file
          }
          "e" {
            Read-Host "Edit file manually, then stage with 'git add'. Press Enter to re-check" | Out-Null
            $stillConflict = (& git diff --name-only --diff-filter=U -- $file)
            if (-not $stillConflict) {
              $done = $true
            }
          }
          "a" {
            Invoke-Git cherry-pick --abort | Out-Null
            throw "Cherry-pick aborted by user."
          }
        }
      }
    }
  }
}

function CherryPick-Commit {
  param([string]$Commit)

  Write-Host ""
  Write-Host ("Cherry-pick: {0}" -f $Commit)
  Invoke-Git cherry-pick $Commit | Out-Null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Applied."
    return
  }

  $conflicts = (& git diff --name-only --diff-filter=U)
  if ($conflicts) {
    Write-Host "Conflicts detected. Entering interactive resolution."
    Resolve-ConflictsInteractive
    Invoke-Git cherry-pick --continue | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to continue cherry-pick for $Commit."
    }
    Write-Host "Applied after conflict resolution."
    return
  }

  Write-Host "No unresolved conflicts but cherry-pick failed."
  Write-Host "Likely empty/already-applied commit."
  while ($true) {
    $next = (Read-Host "Choose [s]kip / [a]bort / [r]etry").Trim().ToLowerInvariant()
    switch ($next) {
      "s" {
        Invoke-Git cherry-pick --skip | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Failed to skip cherry-pick for $Commit." }
        Write-Host "Skipped."
        return
      }
      "a" {
        Invoke-Git cherry-pick --abort | Out-Null
        throw "Cherry-pick aborted by user."
      }
      "r" {
        Invoke-Git cherry-pick $Commit | Out-Null
        if ($LASTEXITCODE -eq 0) {
          Write-Host "Applied."
          return
        }
        $conflicts = (& git diff --name-only --diff-filter=U)
        if ($conflicts) {
          Resolve-ConflictsInteractive
          Invoke-Git cherry-pick --continue | Out-Null
          if ($LASTEXITCODE -ne 0) { throw "Failed to continue cherry-pick for $Commit." }
          Write-Host "Applied after conflict resolution."
          return
        }
      }
      default {
        Write-Host "Invalid choice."
      }
    }
  }
}

function Run-BatchChecks {
  param(
    [string]$BatchName,
    [string[]]$AcceptancePoints
  )

  Write-Section ("Batch {0} acceptance checks" -f $BatchName)

  if (-not $SkipChecks) {
    Write-Host "Running: npm.cmd run typecheck"
    & npm.cmd run typecheck
    if ($LASTEXITCODE -ne 0) { throw "typecheck failed in batch $BatchName" }

    Write-Host "Running: npm.cmd run build"
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw "build failed in batch $BatchName" }
  } else {
    Write-Host "SkipChecks enabled. npm checks were skipped."
  }

  Write-Host "Running: git status -sb"
  & git status -sb

  Write-Host ""
  Write-Host "Manual acceptance points:"
  foreach ($p in $AcceptancePoints) {
    Write-Host ("- {0}" -f $p)
  }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
Set-Location $repoRoot

$batch1Commits = @(
  "688d73477a50773e43c85addc96212aa6290aea5",
  "4ee88f0eb0c648b54b05f006c6796fb7b09b0fae",
  "4da27ae5f19305d445118b7bd19d8c1844be23f2",
  "855e22f9176a71daa51de716370af7f19d55bfb4",
  "2320e1d74b59c65b5b7fc4fa8b05fd9208f4898c"
)

$batch2Commits = @(
  "b0a3fdf95ffdb961261194d10400267251e42f17",
  "84d4634735f9ee13ac1c20faa0e7e31f1b77cae8",
  "453a1452bbf8842faad2a76f4352a579354d940b"
)

$batch3Commits = @(
  "198e3da89b353780f53a91888384da9118995e81",
  "97689588aa2e8240ba4373da5f42ab444c772e72",
  "0590c5c178f4791e2b039d525ecca4d220c3dcae"
)

$batch4Commits = @(
  "2444209723701dda2b881cea2501b239e64e51c1"
)

Write-Section "Pre-flight checks"
Ensure-CleanWorkingTree
Invoke-Git rev-parse --is-inside-work-tree | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Current directory is not a git repository." }

if (-not $SkipFetch) {
  Write-Host "Fetching remotes..."
  Invoke-Git fetch $UpstreamRemote --prune | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to fetch from $UpstreamRemote" }
  Invoke-Git fetch origin --prune | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to fetch from origin" }
}

if ($Batch -eq "1" -or $Batch -eq "all") {
  Write-Section "Batch 1"
  Invoke-Git switch $MainBranch | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to switch to $MainBranch" }
  Invoke-Git pull --ff-only origin $MainBranch | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to fast-forward $MainBranch" }
  Invoke-Git switch -c "sync/upstream-batch1" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to create branch sync/upstream-batch1" }
  foreach ($c in $batch1Commits) { CherryPick-Commit -Commit $c }
  Run-BatchChecks -BatchName "1" -AcceptancePoints @(
    "Chat session sync does not lose messages.",
    "Pending permission prompts survive websocket reconnect.",
    "Processing banner text and style render correctly.",
    "No cherry-pick in-progress state remains."
  )
}

if ($Batch -eq "2" -or $Batch -eq "all") {
  Write-Section "Batch 2"
  Ensure-BranchExists -BranchName "sync/upstream-batch1"
  Invoke-Git switch "sync/upstream-batch1" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to switch to sync/upstream-batch1" }
  Invoke-Git switch -c "sync/upstream-batch2" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to create branch sync/upstream-batch2" }
  foreach ($c in $batch2Commits) { CherryPick-Commit -Commit $c }
  Run-BatchChecks -BatchName "2" -AcceptancePoints @(
    "Mobile terminal shortcuts panel is available and works.",
    "Community button is visible and link is correct.",
    "Auth detection with ANTHROPIC_API_KEY behaves correctly in settings."
  )
}

if ($Batch -eq "3" -or $Batch -eq "all") {
  Write-Section "Batch 3"
  Ensure-BranchExists -BranchName "sync/upstream-batch2"
  Invoke-Git switch "sync/upstream-batch2" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to switch to sync/upstream-batch2" }
  Invoke-Git switch -c "sync/upstream-batch3" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to create branch sync/upstream-batch3" }
  foreach ($c in $batch3Commits) { CherryPick-Commit -Commit $c }
  Run-BatchChecks -BatchName "3" -AcceptancePoints @(
    "Session rename persists after reload.",
    "File tree operations and binary file handling are correct.",
    "Chat terminal lifecycle completes without stuck processing/thinking UI.",
    "Local custom behavior in chat composer/server integration is not regressed."
  )
}

if ($Batch -eq "4" -or $Batch -eq "all") {
  Write-Section "Batch 4"
  Ensure-BranchExists -BranchName "sync/upstream-batch3"
  Invoke-Git switch "sync/upstream-batch3" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to switch to sync/upstream-batch3" }
  Invoke-Git switch -c "sync/upstream-batch4" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to create branch sync/upstream-batch4" }
  foreach ($c in $batch4Commits) { CherryPick-Commit -Commit $c }
  Run-BatchChecks -BatchName "4" -AcceptancePoints @(
    "Shell CLI prompt options are detected and rendered as clickable overlay buttons.",
    "Clicking an option sends the correct numeric input to terminal and closes overlay.",
    "Esc button sends escape key to terminal and closes overlay.",
    "Prompt overlay is cleared on websocket disconnect/reconnect."
  )
}

Write-Section "Done"
Write-Host "Sync flow completed."
Write-Host "Current branch:"
& git branch --show-current
