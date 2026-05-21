# Set Up Blender MCP For Gold-Master STL Review

Status: open
Owner: Human
Created: 2026-05-21
Source: `docs/APPROVED_RELIEF_TRAINING_PROTOCOLS.md`, `https://github.com/ahujasid/blender-mcp`

## Why Human

Blender MCP setup requires local Blender UI access, local MCP client configuration, and consent/security choices. The AI developer can help once the Blender MCP tools are exposed in the next chat, but the local app/add-on connection has to be installed and started on this machine.

## What We Know

- The likely Blender MCP project is `ahujasid/blender-mcp` on GitHub.
- The repository README says it has no official website and warns that unrelated websites are unofficial.
- The project has two parts: a Blender add-on (`addon.py`) and an MCP server started with `uvx blender-mcp`.
- The README lists Blender 3.0+ and Python 3.10+ as prerequisites.
- Default socket settings are `BLENDER_HOST=localhost` and `BLENDER_PORT=9876`.
- The tool can execute arbitrary Python code inside Blender, so save work first and only use it with local project files.

## Steps

1. In the next chat, ask Codex to search for Blender MCP tools first. If a Blender MCP tool is not already exposed, install/configure the MCP server for the chat session.
2. Verify Blender is installed and launches.
3. Verify `uv` is installed:

   ```powershell
   uv --version
   ```

4. If `uv` is missing, install it on Windows:

   ```powershell
   powershell -c "irm https://astral.sh/uv/install.ps1 | iex"
   ```

5. Add the user-local uv bin path to the Windows user PATH if needed, then restart the MCP client/session:

   ```powershell
   $localBin = "$env:USERPROFILE\.local\bin"
   $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
   [Environment]::SetEnvironmentVariable("Path", "$userPath;$localBin", "User")
   ```

6. Configure the MCP server command for the active MCP client:

   ```json
   {
     "mcpServers": {
       "blender": {
         "command": "uvx",
         "args": ["blender-mcp"],
         "env": {
           "DISABLE_TELEMETRY": "true"
         }
       }
     }
   }
   ```

   If the MCP client needs the Windows `cmd` wrapper, use:

   ```json
   {
     "mcpServers": {
       "blender": {
         "command": "cmd",
         "args": ["/c", "uvx", "blender-mcp"],
         "env": {
           "DISABLE_TELEMETRY": "true"
         }
       }
     }
   }
   ```

7. Download `addon.py` from `https://github.com/ahujasid/blender-mcp`.
8. In Blender, go to `Edit > Preferences > Add-ons > Install...`, select `addon.py`, and enable `Interface: Blender MCP`.
9. In Blender's 3D View sidebar, press `N` if the sidebar is hidden, open the `BlenderMCP` tab, and start the connection.
10. Run only one Blender MCP server instance at a time.
11. In the next chat, ask Codex to confirm it can call a Blender MCP scene-info tool before importing any STL.

## Done When

- Blender is open with the Blender MCP add-on enabled.
- The MCP server is configured with `uvx blender-mcp`.
- The next Codex chat can see callable Blender MCP tools.
- A simple scene-info call succeeds.
- We are ready to import a generated `model.stl` and begin the gold-master approval workflow.

## Evidence To Capture

- `uv --version` output.
- Blender version.
- Whether telemetry was disabled.
- Whether the MCP client needed the direct `uvx` command or the Windows `cmd /c uvx` wrapper.
- Screenshot or short note showing the BlenderMCP add-on is enabled.
- Do not capture API keys, tokens, local `.env` contents, or customer-private image content.

## Related Files

- `docs/APPROVED_RELIEF_TRAINING_PROTOCOLS.md`
- `human-tasks/open/test-hybrid-relief-product-flow.md`
- `elliot_quick_dev_Startup.md`

