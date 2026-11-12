#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/../.."
classes="$(mktemp -d)"
trap 'rm -rf "$classes"' EXIT HUP INT TERM
"${JAVA_HOME:+$JAVA_HOME/bin/}java" com.sun.tools.javac.Main -d "$classes" modules/fashion-vision/android/src/main/java/expo/modules/fashionvision/QualityMetrics.java tests/native-java/QualityMetricsTest.java
"${JAVA_HOME:+$JAVA_HOME/bin/}java" -cp "$classes" QualityMetricsTest
