# HAProxy Sticky Sessions

## Setup

```powershell
Start-Job -Name SERVICE_A -ScriptBlock {
    Set-Location $Using:PWD
    $Env:SERVICE_NAME = "A"
    $Env:SERVICE_PORT = "8080"
    npm start
}

Start-Job -Name SERVICE_B-ScriptBlock {
    Set-Location $Using:PWD
    $Env:SERVICE_NAME = "B"
    $Env:SERVICE_PORT = "8082"
    npm start
}

Start-Job -Name SERVICE_C -ScriptBlock {
    Set-Location $Using:PWD
    $Env:SERVICE_NAME = "C"
    $Env:SERVICE_PORT = "8083"
    npm start
}
```

```powershell
Receive-Job -Name SERVICE_A
Receive-Job -Name SERVICE_B
Receive-Job -Name SERVICE_C
```

```powershell
Stop-Job -Name "SERVICE_A", "SERVICE_B", "SERVICE_C"
Remove-Job -Name "SERVICE_A", "SERVICE_B", "SERVICE_C"
```

## Queries

### A -> B -> C

```powershell
curl.exe http://localhost:8080/?call=http%3A%2F%2Flocalhost%3A8082%2F%3Fcall%3Dhttp%253A%252F%252Flocalhost%253A8083%252F
```

### A -> B -> A

```powershell
curl.exe http://localhost:8080/?call=http%3A%2F%2Flocalhost%3A8082%2F%3Fcall%3Dhttp%253A%252F%252Flocalhost%253A8080%252F
```

### B -> A -> B

```powershell
curl.exe http://localhost:8082/?call=http%3A%2F%2Flocalhost%3A8080%2F%3Fcall%3Dhttp%253A%252F%252Flocalhost%253A8082%252F
```

## To-Do

- Add error handling.
