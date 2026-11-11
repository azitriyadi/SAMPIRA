package server

import "embed"

//go:embed app/Views assets docs
var WebFiles embed.FS
