#!/bin/sh
set -eu

script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
api_jar="$script_dir/../backend/target/fashion-centre-api-0.1.0.jar"
java_bin=${JAVA_HOME:+$JAVA_HOME/bin/}java
jar_bin=${JAVA_HOME:+$JAVA_HOME/bin/}jar

if [ ! -f "$api_jar" ]; then
    echo 'Build the Java backend first: cd backend && mvn -B package' >&2
    exit 1
fi

# Reuse the packaged controllers with a separate Spring entry point.
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/fashion-centre-demo.XXXXXX")
trap 'rm -rf -- "$work_dir"' EXIT
cd "$work_dir"
"$jar_bin" xf "$api_jar" BOOT-INF/classes BOOT-INF/lib
"$java_bin" -cp 'BOOT-INF/classes:BOOT-INF/lib/*' "$script_dir/demo-api/DemoApi.java" \
    --server.address=127.0.0.1 \
    --server.port="${FASHION_DEMO_API_PORT:-8082}" \
    --spring.config.name=fashion-centre-local-demo &
java_pid=$!
trap 'kill "$java_pid" 2>/dev/null || true; wait "$java_pid" || true; exit 130' INT TERM
wait "$java_pid"
