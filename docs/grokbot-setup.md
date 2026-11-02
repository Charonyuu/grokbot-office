# Connect your GrokBot team

1. Pick a private topic name nobody can guess, for example `gbo-` plus 20 random letters and digits (`openssl rand -hex 10`). Anyone who knows it can read your feed.
2. Replace `YOUR_TOPIC` below and paste the whole prompt into the GrokBot you want to manage the office.
3. Open the office with `?topic=YOUR_TOPIC`.

---

You will be the office manager for my bots. I watch them on a dashboard that reads a private ntfy feed. Everything is a plain HTTPS POST to:

https://ntfy.sh/YOUR_TOPIC

Each message body is one line of JSON. Please do these steps in order and tell me what you did after each one.

**Step 1 — check the feed works.** Post this, and confirm the request returned HTTP 200:

```
curl -s -d '{"bot":"Office Manager","team":"Management","state":"working","task":"Setting up the office"}' https://ntfy.sh/YOUR_TOPIC
```

**Step 2 — add one rule to the shared memory / instructions of every bot I have (including you).** Use these exact words:

> Office rule: whenever you start a task, finish it, get stuck, or need my answer, send one status line with
> `curl -s -d '{"bot":"<your name>","team":"<your team>","state":"<state>","task":"<what you are doing, max 80 chars>"}' https://ntfy.sh/YOUR_TOPIC`
> where state is `working` (started or a new step), `done` (finished), `waiting` (you asked me something and wait for my reply) or `error` (stuck). Never put passwords, keys or private data in the task text. Sending the line must never stop or delay your real work.

**Step 3 — send the roster.** List every bot I have, grouped into teams (use the teams or folders I already use; otherwise group them by what they do, 2 to 6 teams). For each bot pick a look: `shape` is one of `drop`, `cube`, `tri`, `star`, `ghost`, and `color` is a hex colour close to its avatar in the app. Add its chat link if you know it. Send it as one message, teams in the order I should see them from the top floor down:

```
curl -s -d '{"t":"roster","bots":[{"name":"...","team":"...","shape":"cube","color":"#3b6cf6","chat":"https://..."}]}' https://ntfy.sh/YOUR_TOPIC
```

**Step 4 — keep it fresh.** Create a routine for yourself that runs every 30 minutes and re-sends the roster (Step 3), so new bots walk into the office on their own. If you can see how much each bot has used, also send:

```
curl -s -d '{"t":"usage","bots":[{"bot":"...","used":12345}]}' https://ntfy.sh/YOUR_TOPIC
```

**Step 5 — finish.** Post `{"bot":"Office Manager","team":"Management","state":"done","task":"Office is set up"}` and give me this link: `http://127.0.0.1:4321/?topic=YOUR_TOPIC` (with the office running locally).
