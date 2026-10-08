@AGENTS.md

## FrameFlow project context

FrameFlow is a mobile-first AI video clipping app for Indian creators. It turns long Hindi/Hinglish videos, especially podcasts, into captioned shorts. Claude owns the tech end to end.

- Strategy, architecture, roadmap and open decisions: @docs/strategy.md
- PRD, screen mocks and architecture: [docs/FrameFlow-PRD.pdf](docs/FrameFlow-PRD.pdf), built from [docs/prd/frameflow-prd.html](docs/prd/frameflow-prd.html). To regenerate the PDF, print the HTML with headless Chrome (`--print-to-pdf`).
- Competitor research (Kalakar, VN, OpusClip, Captions and others): [docs/research/competitive-teardown.md](docs/research/competitive-teardown.md)

Keep `docs/strategy.md` current. Add every significant decision to its decision log, and update the roadmap phase status as work completes.

## Handover (do this every day, without fail)

Work on FrameFlow may move between Claude accounts and sessions, and none of them share memory. [HANDOVER.md](HANDOVER.md) is how the next one picks up.

- **Start of a session:** read `HANDOVER.md` before doing anything else.
- **End of every working day:** update `HANDOVER.md` and commit it. Do it before the final message of the day's last task, and also whenever Mohit says he is stopping or a usage limit is close. If a day's work ends without it, updating it is the first job of the next session.
- **What to update:** the date, the branch and last commit, what was done that day, what is half-finished and exactly where it stopped, what is next, anything waiting on Mohit, and any new trap. Rewrite stale sections rather than appending a log.
- Anything Mohit asks for as a standing rule goes in `HANDOVER.md` under "Standing rules from Mohit", because private memory does not travel between accounts.
