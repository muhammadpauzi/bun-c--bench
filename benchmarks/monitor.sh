#!/usr/bin/env bash

# ==============================================================================
# GOGOSKOLA CLUSTER: LIVE ENGINE MONITOR & HISTORICAL COMPARATOR
# Membandingkan performa live dan historis antara Bun (Hono) vs C# (.NET 10)
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HIST_FILE="$SCRIPT_DIR/.history_telemetry.tsv"
K6_BUN_JSON="$SCRIPT_DIR/summary_bun.json"
K6_DOTNET_JSON="$SCRIPT_DIR/summary_dotnet.json"

# Argument handler
if [ "$1" == "--reset" ]; then
    rm -f "$HIST_FILE" "$K6_BUN_JSON" "$K6_DOTNET_JSON"
    echo "✅ History telemetri dan hasil benchmark berhasil di-reset."
    exit 0
fi

# Konfigurasi Tampilan
REFRESH_RATE=1
BAR_WIDTH=18

# Definisi Warna ANSI
C_RESET="\033[0m"
C_BOLD="\033[1m"
C_CYAN="\033[1;36m"
C_GREEN="\033[1;32m"
C_YELLOW="\033[1;33m"
C_RED="\033[1;31m"
C_GRAY="\033[0;90m"
C_WHITE="\033[1;37m"
C_BLUE="\033[1;34m"
C_MAGENTA="\033[1;35m"

# Render horizontal bar dengan warna dinamis
render_bar() {
    local val=$1
    local width=$BAR_WIDTH
    local int_val=$(awk -v v="$val" 'BEGIN { printf "%d", (v>100?100:(v<0?0:v)) }' 2>/dev/null || echo 0)

    local filled=$(( (int_val * width) / 100 ))
    local empty=$(( width - filled ))

    local color=$C_GREEN
    if [ "$int_val" -ge 65 ]; then color=$C_YELLOW; fi
    if [ "$int_val" -ge 85 ]; then color=$C_RED; fi

    local bar=""
    for ((i=0; i<filled; i++)); do bar="${bar}█"; done
    local pad=""
    for ((i=0; i<empty; i++)); do pad="${pad}░"; done

    printf "${color}${bar}${C_GRAY}${pad}${C_RESET}"
}

# Fungsi konversi string memori (misal "54.2MiB", "1.2GiB", "512kB") ke MB murni
parse_to_mb() {
    local raw=$1
    awk -v r="$raw" 'BEGIN {
        gsub(/[^0-9\.]/, "", r);
        val = r + 0;
        if (INDEX(tolower(raw), "gib") || INDEX(tolower(raw), "gb")) val = val * 1024;
        else if (INDEX(tolower(raw), "kib") || INDEX(tolower(raw), "kb")) val = val / 1024;
        printf "%.1f", val;
    }' 2>/dev/null || echo "0.0"
}

# Cleanup cursor saat keluar
trap 'tput cnorm; echo -e "\n${C_RESET}Monitor dihentikan."; exit 0' SIGINT SIGTERM
tput civis # Sembunyikan cursor
clear

while true; do
    tput cup 0 0

    NOW=$(date +"%Y-%m-%d %H:%M:%S")
    HOST_MEM=$(free -m | awk 'NR==2{printf "%.1f/%.1f GB (%.0f%%)", $3/1024, $2/1024, $3*100/$2 }' 2>/dev/null || echo "N/A")
    HOST_LOAD=$(uptime | awk -F'load average:' '{ print $2 }' | cut -d, -f1 | xargs 2>/dev/null || echo "N/A")

    echo -e "${C_CYAN}╔═══════════════════════════════════════════════════════════════════════════════════════════════════════════════╗${C_RESET}"
    echo -e "${C_CYAN}║${C_WHITE}${C_BOLD}   GOGOSKOLA CLUSTER: LIVE ENGINE & HISTORICAL COMPARATOR                                                    ${C_CYAN}║${C_RESET}"
    echo -e "${C_CYAN}║${C_GRAY}   Waktu: ${NOW}  │ Host Load: ${HOST_LOAD}  │ Host RAM: ${HOST_MEM}                                       ${C_CYAN}║${C_RESET}"
    echo -e "${C_CYAN}╠═══════════════════════════════════════════════════════════════════════════════════════════════════════════════╣${C_RESET}"
    printf "${C_CYAN}║${C_BOLD} %-20s │ %-26s │ %-26s │ %-14s │ %-6s ${C_CYAN}║${C_RESET}\n" \
           "ACTIVE CONTAINER" "CPU USAGE" "MEM USAGE" "NET I/O" "PIDS"
    echo -e "${C_CYAN}╠═══════════════════════════════════════════════════════════════════════════════════════════════════════════════╣${C_RESET}"

    HAS_RUNNING_CONTAINERS=false

    # Ambil snapshot docker stats
    STATS_RAW=$(docker stats --no-stream --format "{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}|{{.NetIO}}|{{.PIDs}}" 2>/dev/null || true)

    if [ -n "$STATS_RAW" ]; then
        while IFS="|" read -r name cpu mem_usage mem_perc net pids; do
            [ -z "$name" ] && continue
            HAS_RUNNING_CONTAINERS=true

            clean_cpu=$(echo "$cpu" | tr -d '%' | xargs)
            clean_mem_perc=$(echo "$mem_perc" | tr -d '%' | xargs)
            used_mem_str=$(echo "$mem_usage" | awk '{print $1}')
            used_mb=$(parse_to_mb "$used_mem_str")

            # Simpan telemetri ke history file
            echo -e "${NOW}\t${name}\t${clean_cpu}\t${used_mb}\t${clean_mem_perc}\t${net}\t${pids}" >> "$HIST_FILE"

            cpu_bar=$(render_bar "$clean_cpu")
            mem_bar=$(render_bar "$clean_mem_perc")

            cpu_color=$C_WHITE
            int_cpu=$(awk -v c="$clean_cpu" 'BEGIN { printf "%d", c }' 2>/dev/null || echo 0)
            if [ "$int_cpu" -ge 85 ]; then cpu_color=$C_RED; elif [ "$int_cpu" -ge 60 ]; then cpu_color=$C_YELLOW; fi

            printf "${C_CYAN}║${C_RESET} ${C_BOLD}%-20.20s${C_RESET} │ %s %b%5.1f%%%b │ %s %b%5.1f%%%b │ %-14.14s │ %-6s ${C_CYAN}║${C_RESET}\n" \
                   "$name" \
                   "$cpu_bar" "$cpu_color" "$clean_cpu" "$C_RESET" \
                   "$mem_bar" "$C_WHITE" "$clean_mem_perc" "$C_RESET" \
                   "$net" "$pids"
        done <<< "$STATS_RAW"
    fi

    if [ "$HAS_RUNNING_CONTAINERS" = false ]; then
        printf "${C_CYAN}║${C_GRAY} %-105s ${C_CYAN}║${C_RESET}\n" "Tidak ada container aktif saat ini. Jalankan 'make up-bun' atau 'make up-dotnet'."
    fi

    # ==============================================================================
    # HISTORICAL COMPARISON PANEL (BUN vs C# .NET 10)
    # ==============================================================================
    echo -e "${C_CYAN}╠═══════════════════════════════════════════════════════════════════════════════════════════════════════════════╣${C_RESET}"
    echo -e "${C_CYAN}║${C_YELLOW}${C_BOLD}   📊 HISTORICAL STATS COMPARISON (BUN vs .NET 10)                                                           ${C_CYAN}║${C_RESET}"
    echo -e "${C_CYAN}╠═══════════════════════════════╦═════════════════════════╦═════════════════════════╦═══════════════════════════╣${C_RESET}"
    printf "${C_CYAN}║${C_BOLD} %-29s ║ %-23s ║ %-23s ║ %-25s ${C_CYAN}║${C_RESET}\n" \
           "METRIC" "BUN (Hono + Drizzle)" "C# (.NET 10 + EF)" "ANALYSIS / WINNER"
    echo -e "${C_CYAN}╠═══════════════════════════════╬═════════════════════════╬═════════════════════════╬═══════════════════════════╣${C_RESET}"

    # Ekstraksi agregasi dari file history menggunakan awk
    BUN_STATS="0 0 0 0 0"
    DOTNET_STATS="0 0 0 0 0"

    if [ -f "$HIST_FILE" ]; then
        BUN_STATS=$(awk -F'\t' '$2 ~ /bun/ {
            count++;
            cpu += $3;
            if ($3 > max_cpu) max_cpu = $3;
            if (min_mem == 0 || $4 < min_mem) min_mem = $4;
            if ($4 > max_mem) max_mem = $4;
        } END {
            avg_cpu = count > 0 ? cpu/count : 0;
            printf "%.1f %.1f %.1f %.1f %d", min_mem, max_mem, avg_cpu, max_cpu, count;
        }' "$HIST_FILE" 2>/dev/null || echo "0 0 0 0 0")

        DOTNET_STATS=$(awk -F'\t' '$2 ~ /dotnet/ {
            count++;
            cpu += $3;
            if ($3 > max_cpu) max_cpu = $3;
            if (min_mem == 0 || $4 < min_mem) min_mem = $4;
            if ($4 > max_mem) max_mem = $4;
        } END {
            avg_cpu = count > 0 ? cpu/count : 0;
            printf "%.1f %.1f %.1f %.1f %d", min_mem, max_mem, avg_cpu, max_cpu, count;
        }' "$HIST_FILE" 2>/dev/null || echo "0 0 0 0 0")
    fi

    read -r b_min_mem b_max_mem b_avg_cpu b_max_cpu b_count <<< "$BUN_STATS"
    read -r d_min_mem d_max_mem d_avg_cpu d_max_cpu d_count <<< "$DOTNET_STATS"

    # Baris 1: Idle / Baseline RAM
    b_idle_str="${b_min_mem} MB"
    d_idle_str="${d_min_mem} MB"
    idle_winner="${C_GRAY}- No data -${C_RESET}"
    if (( $(awk -v b="$b_min_mem" -v d="$d_min_mem" 'BEGIN{print (b>0 && d>0)}') )); then
        diff_idle=$(awk -v b="$b_min_mem" -v d="$d_min_mem" 'BEGIN { printf "%.0f%%", ((d-b)/d)*100 }')
        if (( $(awk -v b="$b_min_mem" -v d="$d_min_mem" 'BEGIN{print (b < d)}') )); then
            idle_winner="${C_GREEN}★ Bun (${diff_idle} lighter)${C_RESET}"
        else
            idle_winner="${C_MAGENTA}★ C# (${diff_idle} lighter)${C_RESET}"
        fi
    fi
    printf "${C_CYAN}║${C_RESET} %-29s ║ %-23s ║ %-23s ║ %-34b ${C_CYAN}║${C_RESET}\n" \
           "Idle / Baseline RAM" "$b_idle_str" "$d_idle_str" "$idle_winner"

    # Baris 2: Peak RAM Under Load
    b_peak_str="${b_max_mem} MB"
    d_peak_str="${d_max_mem} MB"
    peak_mem_winner="${C_GRAY}- No data -${C_RESET}"
    if (( $(awk -v b="$b_max_mem" -v d="$d_max_mem" 'BEGIN{print (b>0 && d>0)}') )); then
        diff_peak=$(awk -v b="$b_max_mem" -v d="$d_max_mem" 'BEGIN { printf "%.0f%%", ((d-b)/d)*100 }')
        if (( $(awk -v b="$b_max_mem" -v d="$d_max_mem" 'BEGIN{print (b < d)}') )); then
            peak_mem_winner="${C_GREEN}★ Bun (${diff_peak} less RAM)${C_RESET}"
        else
            peak_mem_winner="${C_MAGENTA}★ C# (${diff_peak} less RAM)${C_RESET}"
        fi
    fi
    printf "${C_CYAN}║${C_RESET} %-29s ║ %-23s ║ %-23s ║ %-34b ${C_CYAN}║${C_RESET}\n" \
           "Peak RAM (Max Observed)" "$b_peak_str" "$d_peak_str" "$peak_mem_winner"

    # Baris 3: Average CPU Under Load
    b_avg_cpu_str="${b_avg_cpu}%"
    d_avg_cpu_str="${d_avg_cpu}%"
    avg_cpu_winner="${C_GRAY}- No data -${C_RESET}"
    if (( $(awk -v b="$b_avg_cpu" -v d="$d_avg_cpu" 'BEGIN{print (b>0 && d>0)}') )); then
        if (( $(awk -v b="$b_avg_cpu" -v d="$d_avg_cpu" 'BEGIN{print (b < d)}') )); then
            avg_cpu_winner="${C_GREEN}★ Bun (More CPU Headroom)${C_RESET}"
        else
            avg_cpu_winner="${C_MAGENTA}★ C# (More CPU Headroom)${C_RESET}"
        fi
    fi
    printf "${C_CYAN}║${C_RESET} %-29s ║ %-23s ║ %-23s ║ %-34b ${C_CYAN}║${C_RESET}\n" \
           "Average CPU Usage" "$b_avg_cpu_str" "$d_avg_cpu_str" "$avg_cpu_winner"

    # Baris 4: Peak CPU
    b_peak_cpu_str="${b_max_cpu}%"
    d_peak_cpu_str="${d_max_cpu}%"
    printf "${C_CYAN}║${C_RESET} %-29s ║ %-23s ║ %-23s ║ %-25s ${C_CYAN}║${C_RESET}\n" \
           "Peak CPU Usage" "$b_peak_cpu_str" "$d_peak_cpu_str" "Saturates at ~100%"

    # Baris 5: Samples Recorded
    printf "${C_CYAN}║${C_RESET} %-29s ║ %-23s ║ %-23s ║ %-25s ${C_CYAN}║${C_RESET}\n" \
           "Telemetry Snapshots" "${b_count} samples" "${d_count} samples" "Updated every 1s"

    # ==============================================================================
    # K6 BENCHMARK RESULTS (JIKA SUDAH PERNAH DIJALANKAN)
    # ==============================================================================
    echo -e "${C_CYAN}╠═══════════════════════════════╬═════════════════════════╬═════════════════════════╬═══════════════════════════╣${C_RESET}"
    echo -e "${C_CYAN}║${C_WHITE}${C_BOLD}   ⚡ K6 BENCHMARK SUMMARY (Throughput & Latency)                                                          ${C_CYAN}║${C_RESET}"
    echo -e "${C_CYAN}╠═══════════════════════════════╬═════════════════════════╬═════════════════════════╬═══════════════════════════╣${C_RESET}"

    # Ekstraksi metrik dari JSON k6 jika file ada
    BUN_RPS="N/A"; BUN_P95="N/A"; BUN_ERR="N/A"
    DOTNET_RPS="N/A"; DOTNET_P95="N/A"; DOTNET_ERR="N/A"

    if [ -f "$K6_BUN_JSON" ]; then
        BUN_RPS=$(grep -o '"http_reqs":{[^}]*}' "$K6_BUN_JSON" | grep -o '"rate":[0-9.]*' | cut -d: -f2 | awk '{printf "%.1f req/s", $1}' 2>/dev/null || echo "Done")
        BUN_P95=$(grep -o '"p(95)":[0-9.]*' "$K6_BUN_JSON" | head -n1 | cut -d: -f2 | awk '{printf "%.2f ms", $1}' 2>/dev/null || echo "Done")
        BUN_ERR=$(grep -o '"http_req_failed":{[^}]*}' "$K6_BUN_JSON" | grep -o '"rate":[0-9.]*' | cut -d: -f2 | awk '{printf "%.2f%%", $1*100}' 2>/dev/null || echo "0%")
    fi

    if [ -f "$K6_DOTNET_JSON" ]; then
        DOTNET_RPS=$(grep -o '"http_reqs":{[^}]*}' "$K6_DOTNET_JSON" | grep -o '"rate":[0-9.]*' | cut -d: -f2 | awk '{printf "%.1f req/s", $1}' 2>/dev/null || echo "Done")
        DOTNET_P95=$(grep -o '"p(95)":[0-9.]*' "$K6_DOTNET_JSON" | head -n1 | cut -d: -f2 | awk '{printf "%.2f ms", $1}' 2>/dev/null || echo "Done")
        DOTNET_ERR=$(grep -o '"http_req_failed":{[^}]*}' "$K6_DOTNET_JSON" | grep -o '"rate":[0-9.]*' | cut -d: -f2 | awk '{printf "%.2f%%", $1*100}' 2>/dev/null || echo "0%")
    fi

    # Output Baris RPS
    rps_winner="${C_GRAY}Run k6 to populate${C_RESET}"
    if [ "$BUN_RPS" != "N/A" ] && [ "$DOTNET_RPS" != "N/A" ]; then
        b_num=$(echo "$BUN_RPS" | awk '{print $1}')
        d_num=$(echo "$DOTNET_RPS" | awk '{print $1}')
        if (( $(awk -v b="$b_num" -v d="$d_num" 'BEGIN{print (b>d)}') )); then
            rps_winner="${C_GREEN}★ Bun is Faster (+RPS)${C_RESET}"
        else
            rps_winner="${C_MAGENTA}★ C# is Faster (+RPS)${C_RESET}"
        fi
    fi
    printf "${C_CYAN}║${C_RESET} %-29s ║ %-23s ║ %-23s ║ %-34b ${C_CYAN}║${C_RESET}\n" \
           "Throughput (RPS)" "$BUN_RPS" "$DOTNET_RPS" "$rps_winner"

    # Output Baris Latency p95
    p95_winner="${C_GRAY}Run k6 to populate${C_RESET}"
    if [ "$BUN_P95" != "N/A" ] && [ "$DOTNET_P95" != "N/A" ]; then
        b_p95_num=$(echo "$BUN_P95" | awk '{print $1}')
        d_p95_num=$(echo "$DOTNET_P95" | awk '{print $1}')
        if (( $(awk -v b="$b_p95_num" -v d="$d_p95_num" 'BEGIN{print (b<d)}') )); then
            p95_winner="${C_GREEN}★ Bun (Lower Latency)${C_RESET}"
        else
            p95_winner="${C_MAGENTA}★ C# (Lower Latency)${C_RESET}"
        fi
    fi
    printf "${C_CYAN}║${C_RESET} %-29s ║ %-23s ║ %-23s ║ %-34b ${C_CYAN}║${C_RESET}\n" \
           "p95 Latency" "$BUN_P95" "$DOTNET_P95" "$p95_winner"

    # Output Baris Error Rate
    printf "${C_CYAN}║${C_RESET} %-29s ║ %-23s ║ %-23s ║ %-25s ${C_CYAN}║${C_RESET}\n" \
           "Failed Requests (Errors)" "$BUN_ERR" "$DOTNET_ERR" "Threshold: < 5%"

    echo -e "${C_CYAN}╚═══════════════════════════════╩═════════════════════════╩═════════════════════════╩═══════════════════════════╝${C_RESET}"
    echo -e "${C_GRAY}Navigasi: [Ctrl+C] Keluar │ Reset history: './benchmarks/monitor.sh --reset'${C_RESET}"

    sleep "$REFRESH_RATE"
done
