Copied workspace implementation from C:\Users\nhung\Documents\01_Workspaces\TorchViz-3D on 2026-11-11. Original repository unchanged.
Included: workspace/editor, 3D renderer, graph layout, inspector, torchstub, Pyodide worker, templates. Excluded: landing page and Learning Lab curriculum.
Integration changes: isolated asset base /torchviz/, DPR=1, demand rendering except active forward animation, code/shape persistence, worker cleanup.

Build: `npm run build` in this directory. Type check: `npm run typecheck`.
The local node_modules junction reuses dependencies installed in the original TorchViz-3D directory. On another machine, install dependencies here first. The built dist/torchviz directory is standalone and does not depend on that junction at runtime. Serve through the main local gateway (absolute asset base /torchviz/).
