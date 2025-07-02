.PHONY: sync
sync:
	cd frontend && npm install

.PHONY: serve
serve:
	cd frontend && npm run dev

