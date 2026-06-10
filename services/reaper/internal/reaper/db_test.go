package reaper

import (
	"strings"
	"testing"
	"time"
)

// ptrInt is a tiny helper for the nullable *int columns classifyReason takes.
func ptrInt(v int) *int { return &v }

// ptrTime is a tiny helper for the nullable *time.Time columns.
func ptrTime(t time.Time) *time.Time { return &t }

// TestClassifyReason locks in the destruction-reason mapping. The
// "max_downloads" case is the one that regressed: a cap-reached share arrives
// as state='expired' (set by increment_download) and MUST classify as
// "max_downloads", which migration 0008 added to the shares_dest_reason_chk
// CHECK. Before that pairing existed, this branch produced a CHECK violation
// that poisoned the whole sweep.
func TestClassifyReason(t *testing.T) {
	past := time.Now().Add(-time.Hour)
	future := time.Now().Add(time.Hour)

	tests := []struct {
		name          string
		burnAfterRead bool
		state         string
		destroyedAt   *time.Time
		expiresAt     *time.Time
		maxDownloads  *int
		downloadCount *int
		want          string
	}{
		{
			name:          "burn-after-read already flipped to destroyed",
			burnAfterRead: true,
			state:         "destroyed",
			destroyedAt:   ptrTime(past),
			expiresAt:     ptrTime(future),
			want:          "burn",
		},
		{
			name:          "download cap reached -> max_downloads (state=expired)",
			burnAfterRead: false,
			state:         "expired",
			expiresAt:     ptrTime(future),
			maxDownloads:  ptrInt(3),
			downloadCount: ptrInt(3),
			want:          "max_downloads",
		},
		{
			name:          "download cap exceeded -> max_downloads",
			burnAfterRead: false,
			state:         "expired",
			maxDownloads:  ptrInt(1),
			downloadCount: ptrInt(5),
			want:          "max_downloads",
		},
		{
			name:      "TTL lapsed, no cap -> expiry",
			state:     "ready",
			expiresAt: ptrTime(past),
			want:      "expiry",
		},
		{
			name:          "under cap, not expired -> defensive expiry default",
			state:         "ready",
			expiresAt:     ptrTime(future),
			maxDownloads:  ptrInt(10),
			downloadCount: ptrInt(1),
			want:          "expiry",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := classifyReason(
				tc.burnAfterRead,
				tc.state,
				tc.destroyedAt,
				tc.expiresAt,
				tc.maxDownloads,
				tc.downloadCount,
			)
			if got != tc.want {
				t.Fatalf("classifyReason = %q, want %q", got, tc.want)
			}
		})
	}
}

// TestSelectReapableCoversExpired guards the candidate query against a
// regression: shares flipped to state='expired' by increment_download (download
// cap reached) must be selectable for reaping, or their ciphertext blobs orphan
// forever. The bug was that the query only matched ready/uploading/pending and
// destroyed — never expired. This is a cheap structural assertion (no DB
// required) that the 'expired' branch is present.
func TestSelectReapableCoversExpired(t *testing.T) {
	if !strings.Contains(selectReapableSQL, "state = 'expired'") {
		t.Fatalf("selectReapableSQL must include a state='expired' branch so cap-reached shares get reaped; query was:\n%s", selectReapableSQL)
	}
	// And it must still cover the live and destroyed cases.
	for _, want := range []string{"'ready'", "'uploading'", "'pending'", "state = 'destroyed'"} {
		if !strings.Contains(selectReapableSQL, want) {
			t.Errorf("selectReapableSQL missing expected branch fragment %q", want)
		}
	}
}
