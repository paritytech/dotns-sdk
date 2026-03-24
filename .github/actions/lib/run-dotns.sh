run_dotns_with_retry() {
  local title="$1"
  local stdout_file="$2"
  local max_retries="$3"
  local retry_delay="$4"
  shift 4

  local attempt
  local exit_code=1

  : >"$stdout_file"

  for attempt in $(seq 1 "$max_retries"); do
    echo "::group::${title} (attempt ${attempt}/${max_retries})"
    if "$@" >"$stdout_file"; then
      echo "::endgroup::"
      return 0
    else
      exit_code=$?
    fi
    echo "::endgroup::"
    echo "::warning::${title} attempt ${attempt}/${max_retries} failed"

    if [[ "$attempt" -lt "$max_retries" ]]; then
      echo "::notice::Retrying in ${retry_delay}s"
      sleep "$retry_delay"
    fi
  done

  return "$exit_code"
}
