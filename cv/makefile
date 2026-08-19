# The compiled PDF is what the site serves at /cv/, so typst writes straight
# into static/ instead of dropping cv.pdf next to the source. Anything Hugo
# should publish has to live under static/ — this folder is source only.
OUT := ../static/cv/cv.pdf

.PHONY: watch compile

ifeq ($(OS),Windows_NT)
    # Windows
    watch:
		@PowerShell -Command "typst watch cv.typ $(OUT)"

    compile:
		@PowerShell -Command "typst compile cv.typ $(OUT)"
else
    # WSL or Unix-like system
    watch:
		@bash -c "typst watch cv.typ $(OUT)"

    compile:
		@bash -c "typst compile cv.typ $(OUT)"
endif
