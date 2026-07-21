export function renderWrapperDockerfile({ baseImage, shimImage }) {
  return `FROM ${shimImage} AS chrono-shim

FROM ${baseImage}
COPY --from=chrono-shim /opt/chronolab/libfaketimeMT.so.1 /opt/chronolab/libfaketime.so.1
COPY --from=chrono-shim /opt/chronolab/LICENSES /opt/chronolab/LICENSES
ENV LD_PRELOAD=/opt/chronolab/libfaketime.so.1 \\
    FAKETIME_TIMESTAMP_FILE=/run/chronolab/faketimerc \\
    FAKETIME_NO_CACHE=1 \\
    FAKETIME_DONT_RESET=1 \\
    NO_FAKE_STAT=1 \\
    TZ=UTC
LABEL dev.chronolab.wrapped="true" \\
      dev.chronolab.base="${baseImage}"
`;
}
