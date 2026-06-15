.PHONY: watch compile

ifeq ($(OS),Windows_NT)
    # Windows
    watch:
		@PowerShell -Command "typst watch cv.typ"

    compile:
		@PowerShell -Command "typst compile cv.typ"
else
    # WSL or Unix-like system
    watch:
		@bash -c "typst watch cv.typ"

    compile:
		@bash -c "typst compile cv.typ"
endif
