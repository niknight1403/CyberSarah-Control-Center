# Custom AI Studio Mobile – Interface Design

## Product intent

Custom AI Studio Mobile is a **mobile control surface** for a repository-based development workspace. It brings the highest-frequency actions of a desktop-like coding environment into a deliberate, portrait-first flow: inspecting a project, reviewing and editing an active file, reading agent output, watching build activity, and securely configuring a remote workspace connection. The device does not attempt to execute untrusted repositories locally. Execution, hot reload, terminal commands, and repository mutation are delegated to an explicitly configured workspace service running on the user's own server.

The interaction model deliberately condenses the requested three-column desktop workspace into three persistent mobile destinations. This makes every primary action reachable with one thumb while retaining a clear conceptual mapping to the requested file explorer, editor, console, AI chat, and preview.

## Screen list

| Screen | Primary content | Main functions |
| --- | --- | --- |
| **Workspace** | Project header, runtime status, recent files, compact file tree, code editor surface, console snapshot | Select a file, edit code locally, save a draft, review runtime events, switch the active workspace |
| **Agent** | Conversation timeline, context chips, prompt composer, proposed changes card | Submit a development request, attach active-file/project context, inspect a plan, apply or dismiss suggested changes |
| **Preview** | Device-sized preview frame, runtime state, log tail, refresh/action strip | Refresh a remote preview, read build output, open the preview in the system browser, see connection issues |
| **Settings** | Remote workspace endpoint, repository URL, GitHub token entry, AI-provider profile selection, privacy notes | Save or remove local credentials, validate endpoint settings, choose a provider profile, disconnect a workspace |
| **File detail sheet** | File metadata, editable source text, dirty-state indicator, save and discard controls | Make focused edits without losing workspace context |
| **Project sheet** | Repository/branch field, clone or attach action, selected workspace summary | Attach a repository to the remote workspace once the service URL is configured |

## Primary content and functionality

### Workspace

The Workspace screen is the default home. A compact dark header identifies the selected repository and branch, while a runtime pill reveals whether the remote service is connected, building, or offline. Below it, a file tree is designed as a tappable outline rather than a desktop panel. Selecting an entry presents its source in a focused monospace editor card. A console segment at the bottom shows the latest events and supports a clear boundary between code state and runtime state.

### Agent

The Agent screen prioritizes short, actionable conversations. The composer accepts a natural-language request and presents context as removable chips, initially covering the active file and selected branch. A response can contain a proposed edit summary with prominent **Apply** and **Review** actions. Until a trusted remote service is connected, responses use the app's prepared local workspace state rather than claiming that server-side changes have already happened.

### Preview

The Preview screen uses a single, high-contrast device canvas and non-blocking status feedback. Its core role is to review a remote hot-reload URL, inspect the latest error lines, and move to the browser when the project needs a full interactive preview. An unavailable service produces an explanatory empty state with a direct path to Settings rather than a blank surface.

### Settings

Settings separates sensitive values from non-sensitive configuration. The workspace base URL and repository URL are ordinary preferences. The GitHub token and custom provider key are kept only in encrypted device storage on native platforms; the web build presents a caution that browser session storage is a lower-security fallback. Provider selection supports the required OpenAI, Groq, Together AI, Anthropic, and an on-server profile, but actual key use remains on the remote workspace service.

## Key user flows

| User goal | Flow |
| --- | --- |
| **Inspect and edit a source file** | Open Workspace → tap a file tree entry → inspect code → edit in the file detail surface → tap Save Draft → local workspace state updates and exposes a pending-sync indicator. |
| **Ask for a code change** | Open Agent → review context chips → enter a request → tap Send → inspect the suggested change summary → choose Review or Apply. |
| **Attach a real repository** | Open Settings → set the HTTPS workspace-service URL → save a GitHub token securely → add repository URL and branch in the project sheet → tap Attach → confirm the returned workspace status. |
| **Review a running app** | Open Preview → tap Refresh → see remote runtime status and logs → open the preview URL in browser for full interaction. |
| **Resolve a failed build** | Open Preview → tap an error event → open Agent with the error context prefilled → ask for a fix → review the proposed patch before applying it. |

## Layout and navigation

The application is designed for **portrait 9:16 use** with a standard bottom navigation bar. The three tabs are Workspace, Agent, and Preview; Settings is opened through a compact top-right action. The leading primary action remains above the fold and on the lower half of the screen when possible. File navigation, provider controls, and additional project operations are sheets rather than permanent panels, limiting visual density and preserving a first-party iOS feel.

The layout uses safe areas, 16–20 pt horizontal padding, 12–16 pt card gaps, 12–16 pt radii, and a minimum 44 pt interactive target. Semantics and colors do not act as the sole indicator of status: labels, icons, and structured text accompany runtime state and severity.

## Color and typography choices

| Token | Hex value | Intended use |
| --- | --- | --- |
| **Void** | `#0A0D12` | Main app background |
| **Panel** | `#121823` | Cards, editor frame, bottom navigation |
| **Inset** | `#1A2330` | Input fields and selected file surface |
| **Signal Cyan** | `#52D8FF` | Primary actions, active tab, linked runtime |
| **Electric Violet** | `#8B7CFF` | Agent identity and contextual accents |
| **Cloud** | `#F2F6FC` | Primary content text |
| **Slate** | `#99A7B8` | Secondary metadata and dividers |
| **Ready Green** | `#45D996` | Healthy runtime and completed actions |
| **Alert Amber** | `#F6BA5E` | Builds in progress and attention states |
| **Fault Coral** | `#FF6B7A` | Error states and destructive actions |

The type hierarchy pairs the platform system font for UI clarity with a monospace system font for code and console text. Titles are compact but decisive; operational state appears in smaller, high-contrast labels rather than oversized decorative copy.

## Service boundary

The app defines a versioned remote-workspace contract for a server that the user can host on a Hetzner VPS. The service owns cloning, file-system access, Git commits/pushes, process execution, CORS, and provider API calls. The mobile client owns presentation, transient editor state, and securely stored device credentials. This separation prevents the mobile app from executing arbitrary repository commands locally and keeps provider secrets out of bundled application code.
