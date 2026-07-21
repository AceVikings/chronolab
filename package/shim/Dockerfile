ARG BUILD_IMAGE=debian:bookworm-slim
FROM ${BUILD_IMAGE} AS build
USER root

RUN apt-get update \
    && apt-get install -y --no-install-recommends libfaketime \
    && library="$(find /usr/lib -name libfaketimeMT.so.1 -print -quit)" \
    && test -n "$library" \
    && mkdir -p /out/LICENSES \
    && cp "$library" /out/libfaketimeMT.so.1 \
    && cp /usr/share/doc/libfaketime/copyright /out/LICENSES/libfaketime.txt \
    && printf '%s\n' 'Source: https://github.com/wolfcw/libfaketime' > /out/LICENSES/source.txt \
    && rm -rf /var/lib/apt/lists/*

FROM scratch
COPY --from=build /out/libfaketimeMT.so.1 /opt/chronolab/libfaketimeMT.so.1
COPY --from=build /out/LICENSES /opt/chronolab/LICENSES
