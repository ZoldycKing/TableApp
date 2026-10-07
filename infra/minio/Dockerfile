FROM golang:1.24.8-alpine AS builder

WORKDIR /src
# Official source archive, pinned by release and independently checked SHA-256.
ADD https://codeload.github.com/minio/minio/tar.gz/refs/tags/RELEASE.2025-10-15T17-29-55Z /tmp/minio.tar.gz
RUN echo "be6d0bd3696c3a13a35f02d3a0280b64319c67918b4501c5c3d87f96d000085c  /tmp/minio.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/minio.tar.gz --strip-components=1 \
    && rm /tmp/minio.tar.gz
ENV CGO_ENABLED=0
RUN go build -p 2 -trimpath \
    -ldflags="-s -w -X github.com/minio/minio/cmd.Version=2025-10-15T17:29:55Z -X github.com/minio/minio/cmd.ReleaseTag=RELEASE.2025-10-15T17-29-55Z" \
    -o /out/minio .

FROM alpine:3.22
RUN apk add --no-cache ca-certificates
COPY --from=builder /out/minio /usr/local/bin/minio
COPY --from=builder /src/LICENSE /licenses/minio/LICENSE
LABEL org.opencontainers.image.source="https://github.com/minio/minio" \
      org.opencontainers.image.version="RELEASE.2025-10-15T17-29-55Z" \
      org.opencontainers.image.licenses="AGPL-3.0-only"
EXPOSE 9000 9001
VOLUME /data
ENTRYPOINT ["/usr/local/bin/minio"]
CMD ["server", "/data", "--console-address", ":9001"]
