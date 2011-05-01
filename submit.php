<!DOCTYPE html>
<html lang="en"><head>
	<meta http-equiv="content-type" content="text/html; charset=UTF-8">
	<meta charset="utf-8">

	<title>You Cannot Beat This Game - Leaderboard</title>
</head>
<body>
<h1>plain scoring</h1>
<?

function save($vars) {
	$handle = fopen('score.csv', 'a+');
	$remaining = preg_replace("/,/", "", htmlspecialchars($vars['remaining']));
	$name = preg_replace("/,/", "", htmlspecialchars($vars['name']));
	$saved = preg_replace("/,/", "", htmlspecialchars($vars['saved']));
	fwrite($handle, $name.', '.$saved.', '.$remaining."\n");
	fseek($handle, 0);
	$ary = array();

	while(($data = fgetcsv($handle, 1000, ',')) !== FALSE) {
		$ary[$data[1]] = $data;
	}
	fclose($handle);

	$handle = fopen('score.csv', 'w');
	krsort($ary);
	foreach($ary as $i => $value) {
		fwrite($handle, join(', ', $value)."\n");
	}
	fclose($handle);
}


function show_form($vars) {
?>
<h1>Submit your score</h1>
<form method="post" action="submit.php">
	<label for="name">Name:</label> <input type="text" name="name" />
	<input type="hidden" name="remaining" value="<?=$vars['p']?>" />
	<input type="hidden" name="saved" value="<?=$vars['s']?>" />
	<input type="submit" value="Submit"/>
</form>
<?
}

function show_leaderboard() {
	$handle = fopen('score.csv', 'r');
?>
<h1>Leaderboard</h1>
<ol>
<?	while (($data = fgetcsv($handle, 1000, ',')) !== FALSE) {
		if (count($data) > 0) {?>
			<li><?=$data[0]?>: saved=<?=$data[1]?>, remaining=<?=$data[2]?></li>
<?		}
	}?>
</ol>
<?
	fclose($handle);
}

if (isset($_POST) && isset($_POST['name'])) {
	save($_POST);
} else if (isset($_GET) && isset($_GET['s'])) {
	show_form($_GET);
}
show_leaderboard();
?>
</body>
