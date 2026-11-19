# Game replay design review

A fresh Antigravity session running Gemini 3.8 Flash High reviewed revision 1 against beb912e. Its inputs were the plan, design direction, snap schema, verified season loader and the field-position helper. It returned a conditional pass in 64 seconds.

Revision 2 specifies the absolute field projection and the fallback for flags and special teams. The reviewer identified a comprehension problem if transport separated the scoreboard from the account. The controls now precede the whole group. The season menu uses fixture metadata and checks the chosen season against archived plays. Both directions are defined for a snap between two key plays. A pace change preserves that snap, so a reader can investigate the surrounding drive.

The review suggested deriving a probability swing from provider fields with a zero default. A missing estimate cannot establish the size of a swing. The archive uses only the recorded Jets-oriented change. Live ESPN fixtures have a separate reader. A scoring or other qualifying play can still appear with missing probability data.

A scratch phone proof stepped from Wilson's tying touchdown to Zuerlein's go-ahead kick and Davis's interception, then reversed to the kick. All three states used the recorded Cleveland scores. Keeping the controls in one place made repeated taps possible across differently sized accounts. This was an implementation check. Fan testing is still pending.

A targeted review covered revision 3's source-credited turnovers, key-play selection and score gaps. A second fresh Antigravity dispatch timed out without a review. A fresh, isolated Codex reviewer then inspected the revision, replay selector, compiler and validator changes, and data tests. Both constructed score-gap cases exposed omissions. The selector now stops at a newly observed change after a gap without attributing points to an unobserved play. The official final appears only on the last play when its recorded after-score agrees with the fixture. Both cases are regression-tested. The verified archive has an after-score on all 77,277 rows.
