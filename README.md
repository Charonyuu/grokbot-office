# GrokBot Office

![GrokBot Office: your Grok Bot pets dozing, working and asking you things in a 3D office](docs/demo.gif)

A live 3D office for the bots in your **Grok Bot** desktop app. Every bot is its own little pet, in the same shape and colour you gave it in the app, with its own named desk. The busy ones type at their desks, the ones that need you bounce on their chairs until you answer, and the ones with nothing to do get up and wander a Google-style campus: a café, a gym and a lounge. One click opens that bot in Grok Bot so you can reply.

> **Credit.** The idea comes from [@0xCodila's GrokBot live dashboard](https://x.com/0xCodila/status/2116960213206966317): teams of bots shown as floors of a 3D office. That dashboard isn't open source. This is an independent, open-source take with its own code, models, layout and data source (it reads the Grok Bot app on your own Mac instead of asking the bots to report in).
>
> **Not affiliated with xAI, Grok or the Grok Bot app.** "Grok Bot" is used only to say which app this works with. The pets mirror the avatar shapes and colours the app lets you pick so your bots look familiar; everything is drawn from code in this repo.

![A floor: named desks on the left; café, gym and lounge on the right, with bots on a break eating, running, playing ping-pong and video games](docs/zones.png)

## Run it

Needs Node.js 18+ and the Grok Bot desktop app on macOS. Nothing to install.

```bash
git clone https://github.com/Charonyuu/grokbot-office
cd grokbot-office
node bin/office.mjs
```

Open http://127.0.0.1:4321/. Your bots appear on their own.

`bin/office.mjs` reads the local cache the Grok Bot app keeps in `~/Library/Application Support/Grok Bot/` (roster, recent conversations, weekly usage) and pushes changes to the page. Point it elsewhere with `GROKBOT_DIR=...`, or change the port with `PORT=...`.

## What you see

| The pet is... | Because |
|---|---|
| away from its desk in the café, gym or lounge | nothing to do: its last reply is done (it's on a break) |
| at its desk, laptop lit, typing | you asked something and it hasn't replied yet, or it just replied |
| bouncing on its chair, yellow "?", yellow ring pulsing round the desk | it is waiting on you: a choice card, a permission ask, a form, an email draft to approve, or a question |
| shaking at its desk with a red "!" and a red ring | it is stuck |
| spinning on the spot | it just finished something |

### Desks and break zones

Every bot on a floor has **its own desk** with a little flag showing its name in its colour. Floors grow to fit: there is always a desk for every bot, however many you have (desk rows get longer, then more rows are added).

The rest of each floor is laid out like a Google office:

| Zone | What bots on a break do there |
|---|---|
| ☕ **Café** | queue at the counter for coffee or a donut, eat and chat at the round tables |
| 🏃 **Gym** | run on the treadmills, rally at the ping-pong table, shoot hoops, do yoga |
| 🎮 **Lounge** | nap on the sofa (sleep bubbles and all), play video games on the bean bags or at the arcade, play foosball, chill and chat |

When a bot finishes, it gets up and **walks** (it never teleports) round the desks and furniture to a free spot. Every so often it wanders on to something else, usually in another zone. When it gets a new job it walks straight back to its desk and starts typing. Bots step aside for each other in the corridors and never share a spot. Over a bot, the little emoji says what it is doing; its card says it in words ("Playing ping-pong · Gym"), and a floor's card counts how many bots are at their desks, in the café, in the gym and in the lounge.

### Seeing all your bots

- **All bots** (top of the lift panel) lays every floor out side by side, all open, so every bot is in view at once. You can also open the page with `?all`.
- **Building** is the stacked tower; pick a floor to cut the building open there.
- The **Today** card lists every bot, floor by floor. Click one to find it.
- `bin/office.mjs` shows every bot you have, including bots hidden from the app's sidebar (they get a **Hidden** floor unless they are in a section). `GROKBOT_SIDEBAR_ONLY=1` shows only what is in the sidebar, as before; bots removed from the sidebar are left out unless you set `GROKBOT_ALL=1`.

![All bots: every floor side by side](docs/all-bots.png)

- **Floors**: one floor per sidebar section in the app (everything else goes on "My bots"). Pick a floor on the lift panel; the floors above lift away. `?floor=<name>` opens on that floor.
- **Needs you**: bottom left, every bot waiting on you. Click one, then **Answer in Grok Bot** to jump straight to that conversation (`grokbot://agent/<id>`).
- **Today**: your plan's weekly usage, and which bots were most active this week.

## Quality

It sets itself: it starts at medium, watches how long frames take, steps down if they are slow and up to high when there is room. It draws 30 frames a second (60 while the camera moves, 10 when the window is in the background). Force a level with `?quality=high`, `?quality=medium` or `?quality=low` (`?lite` is the same as low).

## Without the app

- `?demo` runs a made-up company of 30 bots on four floors, about half of them on a break, so you can look around anywhere. `?demo&bots=60` pads it out to 60 bots (the extras share one big floor) to see a crowded office.
- `?topic=<ntfy topic>` reads status lines from an [ntfy](https://ntfy.sh) topic instead, for bots that report in themselves. [docs/grokbot-setup.md](docs/grokbot-setup.md) has a prompt that sets this up. Messages are one JSON line each:

```json
{"t":"roster","bots":[{"name":"Weekly Digest","team":"Studio","shape":"blob","color":"#FF9800"}]}
{"bot":"Weekly Digest","state":"working","task":"Collecting links"}
{"bot":"Weekly Digest","state":"waiting","task":"Send it now or Monday?"}
{"bot":"Weekly Digest","state":"done","task":"Sent the digest"}
```

## Privacy

Everything stays on your machine. The server only listens on 127.0.0.1, reads the app's cache read-only, and the page only ever shows bot names and short snippets of their last message. Nothing is sent anywhere.

## Known limits

- The Grok Bot app writes its local cache from time to time, not on every message, so the office can lag behind what you see in the app.
- The cache has no per-bot token counts, so "most active" counts replies; the plan's weekly usage is the app's own figure.
- All floors are the same size, sized for your busiest team, so smaller teams have some free desks.
- Break spots are shared first come, first served; when a floor has more bots on a break than spots, the extras stand and chat in open space.

## 中文說明

把 Grok Bot 桌面版裡的 bot 變成 3D 辦公室裡的寵物。每個 bot 都有自己的專屬座位，桌上插著寫了名字的小旗子；忙的在座位上打字，需要你回覆的會在椅子上跳、座位周圍亮起黃色光圈（卡住的是紅色「!」），點一下「Answer in Grok Bot」就跳回那個對話。執行 `node bin/office.mjs`，打開 http://127.0.0.1:4321/ 就好，資料只在你自己的電腦上讀取。

辦公室參考 Google 辦公室的配置，除了座位區，每層樓還有：

- ☕ **餐廳／咖啡區**：在吧台排隊拿咖啡、甜甜圈，坐在圓桌吃飯聊天
- 🏃 **運動區**：跑步機、桌球、投籃、瑜珈墊
- 🎮 **休閒區**：沙發上睡午覺、懶骨頭打電動、大型機台、手足球、聊天

bot 閒置時會離開座位，**走路**（不是瞬移）到這些區域找空位活動，過一陣子會換到別的區域；一接到工作就走回自己的座位開始打字。頭上的小圖示會顯示它正在做什麼，點開 bot 卡片也會寫出來（例如「Playing ping-pong · Gym」）。

想一次看到全部的 bot：按電梯面板最上面的 **All bots**（或網址加 `?all`），所有樓層會攤開並排顯示；右側 Today 卡片也會列出每一個 bot。人數再多，樓層也會自動加長、加排，保證每個 bot 都有位子。側邊欄裡隱藏的 bot 也會顯示（放在 Hidden 樓層）；只想看側邊欄的 bot 可設 `GROKBOT_SIDEBAR_ONLY=1`。用 `?demo` 可以看 30 個 bot 的示範，`?demo&bots=60` 可以看更擠的辦公室。

點子來自 [@0xCodila 的 GrokBot 即時儀表板](https://x.com/0xCodila/status/2116960213206966317)（未開源）；這是獨立的開源實作，程式、模型、版面和資料來源都是自己做的。與 xAI、Grok、Grok Bot 官方無關。

## See also

[**whatsmyagentdoing**](https://github.com/Charonyuu/whatsmyagentdoing) is the same idea for coding agents: type `/myoffice` and every Claude Code, Codex, Gemini CLI, Copilot CLI and Grok Build session on your machine shows up in a little office, thinking, running tools, or waiting for you. GrokBot Office grew out of it.

想看寫程式的 agent（Claude Code、Codex、Gemini CLI……）在做什麼，可以用同系列的 [whatsmyagentdoing](https://github.com/Charonyuu/whatsmyagentdoing)。

## Credits

- Idea: [@0xCodila](https://x.com/0xCodila/status/2116960213206966317)
- 3D: [three.js](https://threejs.org) (MIT), loaded from jsDelivr
- Fonts: Plus Jakarta Sans and Fredoka (SIL Open Font License), from Google Fonts

## License

MIT
