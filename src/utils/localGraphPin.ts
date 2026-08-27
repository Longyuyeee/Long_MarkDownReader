export const LOCAL_GRAPH_PIN_KEY = 'longedit.localGraph.pinned.v1'

export const readLocalGraphPinned = () => localStorage.getItem(LOCAL_GRAPH_PIN_KEY) === 'true'

export const writeLocalGraphPinned = (pinned: boolean) => localStorage.setItem(LOCAL_GRAPH_PIN_KEY, String(pinned))
